import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/db";

/**
 * Motor de la sincronización PC ↔ nube (modo SYNC). Lo usan los dos lados.
 *
 * - Cada tabla sincronizada tiene `sync_updated_at` (cuándo cambió el renglón; gana el más reciente)
 *   y `sync_seq` (orden de cambios en ESTA base; lo pone un trigger). Los borrados quedan en
 *   `sync_deletions`. Ver drizzle/0008_pc_modes_sync.sql.
 * - Exportar: "lo que cambió en esta cadena después de N", por tabla.
 * - Aplicar: insertar o actualizar renglón por renglón, solo si es más reciente y solo dentro de
 *   la cadena (lo que no pertenece a la cadena se ignora). Un renglón que choca con otro (p. ej. un
 *   slug o un correo que ya usa otra cadena) se salta y se reporta, sin detener lo demás.
 */

type Own = (alias: string, org: string) => SQL;

const inOrgRestaurants = (col: string, org: string) =>
  sql.raw(`${col} in (select id from restaurants where organization_id = '${org}')`);

export const SYNC_TABLES: { name: string; key: string[]; own: Own; batch: number }[] = [
  { name: "restaurants", key: ["id"], batch: 20, own: (a, o) => sql.raw(`${a}.organization_id = '${o}'`) },
  { name: "users", key: ["id"], batch: 500, own: (a, o) => sql.raw(`${a}.organization_id = '${o}'`) },
  {
    name: "user_restaurants",
    key: ["user_id", "restaurant_id"],
    batch: 1000,
    own: (a, o) =>
      sql.raw(
        `${a}.user_id in (select id from users where organization_id = '${o}') and ${a}.restaurant_id in (select id from restaurants where organization_id = '${o}')`,
      ),
  },
  { name: "surveys", key: ["id"], batch: 500, own: (a, o) => inOrgRestaurants(`${a}.restaurant_id`, o) },
  {
    name: "questions",
    key: ["id"],
    batch: 1000,
    own: (a, o) =>
      sql.raw(
        `${a}.survey_id in (select s.id from surveys s join restaurants r on r.id = s.restaurant_id where r.organization_id = '${o}')`,
      ),
  },
  { name: "devices", key: ["id"], batch: 500, own: (a, o) => inOrgRestaurants(`${a}.restaurant_id`, o) },
  { name: "responses", key: ["id"], batch: 1000, own: (a, o) => inOrgRestaurants(`${a}.restaurant_id`, o) },
  {
    name: "answers",
    key: ["id"],
    batch: 3000,
    own: (a, o) =>
      sql.raw(
        `${a}.response_id in (select x.id from responses x join restaurants r on r.id = x.restaurant_id where r.organization_id = '${o}')`,
      ),
  },
];

const TABLE_NAMES = new Set(SYNC_TABLES.map((t) => t.name));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SyncRow = Record<string, unknown>;
export type SyncDeletion = { table: string; key: string };
export type SyncBatch = {
  tables: Record<string, SyncRow[]>;
  deletions: SyncDeletion[];
  /** Mayor sync_seq exportado por tabla (y "_deletions"): el cursor que sigue. */
  cursors: Record<string, number>;
  /** Alguna tabla llegó al límite: hay más por mandar. */
  more: boolean;
};

function assertUuid(v: string) {
  if (!UUID_RE.test(v)) throw new Error("id inválido");
}

/** Cambios de la cadena `org` después de los cursores dados (por tabla). */
export async function exportChanges(
  org: string,
  after: Record<string, number> = {},
  ex: Pick<Tx, "execute"> = db,
): Promise<SyncBatch> {
  assertUuid(org);
  const out: SyncBatch = { tables: {}, deletions: [], cursors: {}, more: false };
  for (const t of SYNC_TABLES) {
    const since = Number(after[t.name] ?? 0);
    const rows = await ex.execute<{ row: SyncRow; seq: string }>(sql`
      select row_to_json(t) as row, t.sync_seq as seq
      from ${sql.raw(t.name)} t
      where ${t.own("t", org)} and t.sync_seq > ${since}
      order by t.sync_seq
      limit ${t.batch}
    `);
    out.tables[t.name] = rows.map((r) => r.row);
    out.cursors[t.name] = rows.length ? Number(rows[rows.length - 1].seq) : since;
    if (rows.length === t.batch) out.more = true;
  }
  const since = Number(after._deletions ?? 0);
  const dels = await ex.execute<{ table_name: string; row_key: string; seq: string }>(sql`
    select table_name, row_key, sync_seq as seq from sync_deletions
    where organization_id = ${org} and sync_seq > ${since}
    order by sync_seq limit 2000
  `);
  out.deletions = dels.map((d) => ({ table: d.table_name, key: d.row_key }));
  out.cursors._deletions = dels.length ? Number(dels[dels.length - 1].seq) : since;
  if (dels.length === 2000) out.more = true;
  return out;
}

export type ApplyResult = { applied: number; skipped: { table: string; key: string; reason: string }[] };

/**
 * Aplica cambios que llegaron del otro lado dentro de la cadena `org` de esta base.
 * `side` es el lado que aplica: "pc" (no se vuelven a subir) o "cloud".
 */
export async function applyChanges(
  org: string,
  batch: Pick<SyncBatch, "tables" | "deletions">,
  side: "pc" | "cloud",
): Promise<ApplyResult> {
  assertUuid(org);
  const result: ApplyResult = { applied: 0, skipped: [] };
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('sobremesa.sync_apply', ${side}, true)`);
    for (const t of SYNC_TABLES) {
      let rows = (batch.tables?.[t.name] ?? []).filter((r) => r && typeof r === "object");
      // Una sola encuesta activa por restaurante: primero las que se archivan, al último las activas.
      if (t.name === "surveys") rows = [...rows].sort((a, b) => Number(a.status === "ACTIVE") - Number(b.status === "ACTIVE"));
      for (const raw of rows) {
        const row: SyncRow = { ...raw };
        if (t.name === "restaurants" || t.name === "users") row.organization_id = org;
        if (t.name === "users") row.platform_admin = false;
        const key = t.key.map((k) => String(row[k] ?? "")).join(":");
        try {
          const changed = await tx.transaction(async (sp) => upsert(sp, t, org, row, side));
          if (changed) result.applied += 1;
        } catch (e) {
          result.skipped.push({ table: t.name, key, reason: shortReason(e) });
        }
      }
    }
    for (const d of batch.deletions ?? []) {
      const t = SYNC_TABLES.find((x) => x.name === d.table);
      if (!t || !TABLE_NAMES.has(d.table) || typeof d.key !== "string") continue;
      const parts = d.key.split(":");
      if (parts.length !== t.key.length || !parts.every((p) => UUID_RE.test(p))) continue;
      try {
        await tx.transaction(async (sp) => {
          const match = sql.join(
            t.key.map((k, i) => sql`${sql.raw(`t.${k}`)} = ${parts[i]}::uuid`),
            sql` and `,
          );
          await sp.execute(sql`delete from ${sql.raw(t.name)} t where ${match} and ${t.own("t", org)}`);
        });
        result.applied += 1;
      } catch (e) {
        result.skipped.push({ table: d.table, key: d.key, reason: shortReason(e) });
      }
    }
  });
  return result;
}

async function upsert(tx: Pick<Tx, "execute">, t: (typeof SYNC_TABLES)[number], org: string, row: SyncRow, side: "pc" | "cloud") {
  const json = JSON.stringify(row);
  const conflict = sql.raw(t.key.join(", "));
  const cols = await tableColumns(tx, t.name);
  const settable = cols.filter((c) => !t.key.includes(c) && c !== "sync_seq");
  const set = sql.raw(settable.map((c) => `"${c}" = excluded."${c}"`).join(", "));
  // En la nube, una cuenta convertida en administrador de la plataforma no se toca desde una PC.
  const guard = t.name === "users" && side === "cloud" ? sql` and not ${sql.raw(t.name)}.platform_admin` : sql``;
  const res = await tx.execute(sql`
    insert into ${sql.raw(t.name)}
    select * from json_populate_record(null::${sql.raw(t.name)}, ${json}::json) r
    where ${t.own("r", org)}
    on conflict (${conflict}) do update set ${set}
    where ${sql.raw(t.name)}.sync_updated_at < excluded.sync_updated_at and ${t.own(t.name, org)}${guard}
  `);
  return (res as unknown as { count?: number }).count !== 0;
}

const columnCache = new Map<string, string[]>();
async function tableColumns(tx: Pick<Tx, "execute">, table: string) {
  const hit = columnCache.get(table);
  if (hit) return hit;
  const rows = await tx.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = ${table} order by ordinal_position
  `);
  const cols = rows.map((r) => r.column_name);
  columnCache.set(table, cols);
  return cols;
}

function shortReason(e: unknown) {
  const err = e as { cause?: { code?: string; constraint_name?: string; message?: string }; message?: string };
  const c = err.cause ?? err;
  if ((c as { code?: string }).code === "23505")
    return `duplicado (${(c as { constraint_name?: string }).constraint_name ?? "único"})`;
  if ((c as { code?: string }).code === "23503") return "falta el registro del que depende";
  return String((c as { message?: string }).message ?? "error").slice(0, 120);
}
