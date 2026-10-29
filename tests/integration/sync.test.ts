import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { applyChanges, exportChanges } from "@/lib/sync";
import { type Chain, resetDb, seedChain } from "./helpers";

let A: Chain;
let B: Chain;

beforeEach(async () => {
  await resetDb();
  A = await seedChain("Cadena A", "aaa");
  B = await seedChain("Cadena B", "bbb");
});
afterAll(resetDb);

const restaurantRow = async (id: string) =>
  (await db.execute<{ row: Record<string, unknown> }>(sql`select row_to_json(r) as row from restaurants r where id = ${id}`))[0]
    .row;

describe("exportar cambios", () => {
  it("solo de la cadena y después del cursor", async () => {
    const all = await exportChanges(A.org.id);
    expect(all.tables.restaurants.map((r) => r.name).sort()).toEqual(["Restaurante aaa dos", "Restaurante aaa uno"]);
    expect(all.tables.responses).toHaveLength(3);
    expect(all.tables.users.every((u) => u.organization_id === A.org.id)).toBe(true);
    const none = await exportChanges(A.org.id, all.cursors);
    expect(Object.values(none.tables).every((rows) => rows.length === 0)).toBe(true);
    await db.update(s.restaurants).set({ address: "Nueva" }).where(eq(s.restaurants.id, A.one.restaurant.id));
    const after = await exportChanges(A.org.id, all.cursors);
    expect(after.tables.restaurants.map((r) => r.address)).toEqual(["Nueva"]);
  });

  it("los borrados quedan registrados para la otra base", async () => {
    const all = await exportChanges(A.org.id);
    await db.delete(s.devices).where(eq(s.devices.id, A.device.id));
    const after = await exportChanges(A.org.id, all.cursors);
    expect(after.deletions).toEqual([{ table: "devices", key: A.device.id }]);
  });
});

describe("aplicar cambios", () => {
  it("gana el más reciente", async () => {
    const row = await restaurantRow(A.one.restaurant.id);
    const older = { ...row, address: "Vieja", sync_updated_at: "2000-01-01T00:00:00Z" };
    expect((await applyChanges(A.org.id, { tables: { restaurants: [older] }, deletions: [] }, "pc")).applied).toBe(0);
    const newer = { ...row, address: "Más nueva", sync_updated_at: new Date(Date.now() + 60_000).toISOString() };
    expect((await applyChanges(A.org.id, { tables: { restaurants: [newer] }, deletions: [] }, "pc")).applied).toBe(1);
    const saved = await db.query.restaurants.findFirst({ where: eq(s.restaurants.id, A.one.restaurant.id) });
    expect(saved?.address).toBe("Más nueva");
    // Aplicado desde la nube en la PC: no se vuelve a subir.
    expect(saved?.syncSeq).toBe(0);
  });

  it("no toca nada de otra cadena", async () => {
    const theirs = await restaurantRow(B.one.restaurant.id);
    const hijack = { ...theirs, name: "Mío", sync_updated_at: new Date(Date.now() + 60_000).toISOString() };
    await applyChanges(A.org.id, { tables: { restaurants: [hijack] }, deletions: [] }, "cloud");
    expect((await db.query.restaurants.findFirst({ where: eq(s.restaurants.id, B.one.restaurant.id) }))?.name).toBe(
      "Restaurante bbb uno",
    );
    // Una encuesta que apunta a un restaurante de otra cadena no entra.
    const survey = {
      id: randomUUID(),
      restaurant_id: B.one.restaurant.id,
      title: "Intrusa",
      welcome_text: "",
      closing_text: "",
      status: "DRAFT",
      version: 1,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      sync_updated_at: new Date().toISOString(),
      sync_seq: 0,
    };
    await applyChanges(A.org.id, { tables: { surveys: [survey] }, deletions: [] }, "cloud");
    expect(await db.query.surveys.findFirst({ where: eq(s.surveys.id, survey.id as string) })).toBeUndefined();
    // Un borrado de algo de otra cadena tampoco.
    await applyChanges(A.org.id, { tables: {}, deletions: [{ table: "devices", key: B.device.id }] }, "cloud");
    expect(await db.query.devices.findFirst({ where: eq(s.devices.id, B.device.id) })).toBeDefined();
  });

  it("una PC no puede hacer a nadie administrador de la plataforma ni tocar a uno", async () => {
    const [u] = await db.execute<{ row: Record<string, unknown> }>(
      sql`select row_to_json(u) as row from users u where id = ${A.admin.id}`,
    );
    const later = new Date(Date.now() + 60_000).toISOString();
    await applyChanges(
      A.org.id,
      { tables: { users: [{ ...u.row, platform_admin: true, sync_updated_at: later }] }, deletions: [] },
      "cloud",
    );
    expect((await db.query.users.findFirst({ where: eq(s.users.id, A.admin.id) }))?.platformAdmin).toBe(false);
    await db.update(s.users).set({ platformAdmin: true }).where(eq(s.users.id, A.admin.id));
    const later2 = new Date(Date.now() + 120_000).toISOString();
    await applyChanges(
      A.org.id,
      { tables: { users: [{ ...u.row, password_hash: "robada", sync_updated_at: later2 }] }, deletions: [] },
      "cloud",
    );
    expect((await db.query.users.findFirst({ where: eq(s.users.id, A.admin.id) }))?.passwordHash).not.toBe("robada");
  });

  it("un correo que ya usa otra cadena se salta sin detener lo demás", async () => {
    const newUser = {
      id: randomUUID(),
      organization_id: A.org.id,
      name: "X",
      email: B.admin.email,
      password_hash: "x",
      role: "MANAGER",
      active: true,
      notify_low_scores: false,
      session_version: 1,
      platform_admin: false,
      last_login_at: null,
      created_at: new Date().toISOString(),
      sync_updated_at: new Date().toISOString(),
      sync_seq: 0,
    };
    const row = await restaurantRow(A.two.restaurant.id);
    const r = await applyChanges(
      A.org.id,
      {
        tables: {
          users: [newUser],
          restaurants: [{ ...row, address: "Sí entra", sync_updated_at: new Date(Date.now() + 60_000).toISOString() }],
        },
        deletions: [],
      },
      "cloud",
    );
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toMatchObject({ table: "users" });
    expect((await db.query.restaurants.findFirst({ where: eq(s.restaurants.id, A.two.restaurant.id) }))?.address).toBe(
      "Sí entra",
    );
  });

  it("aplica borrados de la misma cadena (en cascada)", async () => {
    await applyChanges(A.org.id, { tables: {}, deletions: [{ table: "restaurants", key: A.two.restaurant.id }] }, "pc");
    expect(await db.query.restaurants.findFirst({ where: eq(s.restaurants.id, A.two.restaurant.id) })).toBeUndefined();
    expect(await db.query.surveys.findMany({ where: eq(s.surveys.restaurantId, A.two.restaurant.id) })).toHaveLength(0);
  });
});
