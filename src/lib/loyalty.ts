import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { loyaltyRewards, loyaltyTransactions, restaurants } from "@/db/schema";
import type { SessionUser } from "./auth";
import { dayInTz } from "./dates";
import { logger } from "./logger";
import { normalizePhone } from "./phone";

/**
 * Programa de puntos. El comensal deja su celular al terminar la encuesta y gana los puntos que
 * tenga configurados esa sucursal (restaurants.loyalty_points). El saldo es de la cadena completa:
 * gana en una sucursal y canjea en cualquiera. Todo movimiento queda en loyalty_transactions.
 */

/** Tope de puntos por encuesta y por ajuste manual (evita errores de dedo). */
export const MAX_POINTS_PER_SURVEY = 1000;
export const MAX_ADJUST_POINTS = 100_000;

export class LoyaltyError extends Error {}

type Ex = Pick<Tx, "execute">;

/** Restaurantes de la cadena (subconsulta). */
const orgRestaurants = (organizationId: string) =>
  sql`(select ${restaurants.id} from ${restaurants} where ${restaurants.organizationId} = ${organizationId})`;

/** Saldo del celular en toda la cadena. */
export async function getBalance(organizationId: string, phone: string, ex: Ex = db): Promise<number> {
  const [row] = await ex.execute<{ balance: number }>(sql`
    select coalesce(sum(points), 0)::int as balance from loyalty_transactions
    where phone = ${phone} and restaurant_id in ${orgRestaurants(organizationId)}
  `);
  return Number(row?.balance ?? 0);
}

/** Serializa los movimientos que restan puntos a un mismo celular de una cadena (no sobregirar). */
async function lockMember(tx: Ex, organizationId: string, phone: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`loyalty:${organizationId}:${phone}`}, 0))`);
}

export type EarnResult =
  | { status: "earned"; points: number; balance: number }
  /** Ya ganó hoy en esta sucursal: la encuesta se guarda, pero sin puntos. */
  | { status: "already_today"; balance: number }
  | { status: "invalid_phone" };

/**
 * Da los puntos de una respuesta recién guardada (dentro de la misma transacción). El límite de uno
 * por celular, sucursal y día lo garantiza un índice único, así que dos envíos al mismo tiempo no
 * ganan doble.
 */
export async function earnForResponse(
  tx: Tx,
  p: { organizationId: string; restaurantId: string; responseId: string; phone: string; points: number; at: Date },
): Promise<EarnResult> {
  const phone = normalizePhone(p.phone);
  if (!phone) return { status: "invalid_phone" };
  const rows = await tx
    .insert(loyaltyTransactions)
    .values({
      restaurantId: p.restaurantId,
      phone,
      kind: "EARN",
      points: p.points,
      earnDay: dayInTz(p.at),
      responseId: p.responseId,
      createdAt: p.at,
    })
    .onConflictDoNothing()
    .returning({ id: loyaltyTransactions.id });
  const balance = await getBalance(p.organizationId, phone, tx);
  if (rows.length === 0) return { status: "already_today", balance };
  return { status: "earned", points: p.points, balance };
}

function assertBranch(user: SessionUser, restaurantId: string) {
  if (!user.restaurantIds.includes(restaurantId)) throw new LoyaltyError("Elige una sucursal");
}

/** Canjea un premio del catálogo en una sucursal del usuario. Devuelve el saldo que queda. */
export async function redeemReward(user: SessionUser, input: { phone: string; restaurantId: string; rewardId: string }) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new LoyaltyError("Celular inválido");
  assertBranch(user, input.restaurantId);
  const reward = await db.query.loyaltyRewards.findFirst({
    where: and(eq(loyaltyRewards.id, input.rewardId), eq(loyaltyRewards.organizationId, user.organizationId)),
  });
  if (!reward || !reward.active) throw new LoyaltyError("Ese premio ya no está disponible");

  const balance = await db.transaction(async (tx) => {
    await lockMember(tx, user.organizationId, phone);
    const current = await getBalance(user.organizationId, phone, tx);
    if (current < reward.pointsCost) {
      throw new LoyaltyError(
        `No le alcanza: tiene ${current.toLocaleString("es-MX")} puntos y el premio cuesta ${reward.pointsCost.toLocaleString("es-MX")}.`,
      );
    }
    await tx.insert(loyaltyTransactions).values({
      restaurantId: input.restaurantId,
      phone,
      kind: "REDEEM",
      points: -reward.pointsCost,
      rewardId: reward.id,
      rewardName: reward.name,
      createdById: user.id,
      createdByName: user.name,
    });
    return current - reward.pointsCost;
  });
  logger.info("loyalty.redeemed", { restaurantId: input.restaurantId, rewardId: reward.id, points: reward.pointsCost });
  return { balance, reward };
}

/** Ajuste manual (solo administradores): suma o resta puntos con un motivo. No deja el saldo en negativo. */
export async function adjustPoints(
  user: SessionUser,
  input: { phone: string; restaurantId: string; points: number; note: string },
) {
  if (user.role !== "ADMIN") throw new LoyaltyError("Solo un administrador puede ajustar puntos");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new LoyaltyError("Celular inválido");
  assertBranch(user, input.restaurantId);
  if (!Number.isInteger(input.points) || input.points === 0 || Math.abs(input.points) > MAX_ADJUST_POINTS)
    throw new LoyaltyError("Escribe una cantidad de puntos válida");
  const note = input.note.trim();
  if (note.length < 3) throw new LoyaltyError("Escribe el motivo del ajuste");

  const balance = await db.transaction(async (tx) => {
    await lockMember(tx, user.organizationId, phone);
    const current = await getBalance(user.organizationId, phone, tx);
    if (current + input.points < 0)
      throw new LoyaltyError(`El saldo quedaría en negativo (tiene ${current.toLocaleString("es-MX")}).`);
    await tx.insert(loyaltyTransactions).values({
      restaurantId: input.restaurantId,
      phone,
      kind: "ADJUST",
      points: input.points,
      note: note.slice(0, 200),
      createdById: user.id,
      createdByName: user.name,
    });
    return current + input.points;
  });
  logger.info("loyalty.adjusted", { restaurantId: input.restaurantId, points: input.points });
  return { balance };
}

/** Ficha de un celular: saldo de la cadena y sus últimos movimientos (de cualquier sucursal de la cadena). */
export async function getMember(user: SessionUser, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const inOrg = sql`${loyaltyTransactions.restaurantId} in ${orgRestaurants(user.organizationId)}`;
  const [totals] = await db
    .select({
      balance: sql<number>`coalesce(sum(${loyaltyTransactions.points}), 0)::int`,
      earned: sql<number>`coalesce(sum(${loyaltyTransactions.points}) filter (where ${loyaltyTransactions.kind} = 'EARN'), 0)::int`,
      visits: sql<number>`count(*) filter (where ${loyaltyTransactions.kind} = 'EARN')::int`,
      redemptions: sql<number>`count(*) filter (where ${loyaltyTransactions.kind} = 'REDEEM')::int`,
      firstAt: sql<Date | null>`min(${loyaltyTransactions.createdAt})`,
    })
    .from(loyaltyTransactions)
    .where(and(eq(loyaltyTransactions.phone, phone), inOrg));
  const history = await db
    .select({
      id: loyaltyTransactions.id,
      kind: loyaltyTransactions.kind,
      points: loyaltyTransactions.points,
      rewardName: loyaltyTransactions.rewardName,
      note: loyaltyTransactions.note,
      createdByName: loyaltyTransactions.createdByName,
      createdAt: loyaltyTransactions.createdAt,
      restaurantName: restaurants.name,
    })
    .from(loyaltyTransactions)
    .innerJoin(restaurants, eq(restaurants.id, loyaltyTransactions.restaurantId))
    .where(and(eq(loyaltyTransactions.phone, phone), inOrg))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(100);
  return {
    phone,
    balance: Number(totals?.balance ?? 0),
    earned: Number(totals?.earned ?? 0),
    visits: Number(totals?.visits ?? 0),
    redemptions: Number(totals?.redemptions ?? 0),
    firstAt: totals?.firstAt ? new Date(totals.firstAt) : null,
    history,
  };
}

/** Resumen del programa en las sucursales que ve el usuario (últimos 30 días + totales). */
export async function getLoyaltyOverview(user: SessionUser) {
  if (user.restaurantIds.length === 0) {
    return { members: 0, outstanding: 0, earned30: 0, redeemed30: 0, redemptions30: 0, recent: [] };
  }
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  // En plantillas `sql` crudas el driver no convierte Date: va como texto ISO con cast.
  const sinceTs = sql`${since.toISOString()}::timestamptz`;
  const scope = inArray(loyaltyTransactions.restaurantId, user.restaurantIds);
  const [t] = await db
    .select({
      members: sql<number>`count(distinct ${loyaltyTransactions.phone})::int`,
      earned30: sql<number>`coalesce(sum(${loyaltyTransactions.points}) filter (where ${loyaltyTransactions.kind} = 'EARN' and ${loyaltyTransactions.createdAt} >= ${sinceTs}), 0)::int`,
      redeemed30: sql<number>`coalesce(-sum(${loyaltyTransactions.points}) filter (where ${loyaltyTransactions.kind} = 'REDEEM' and ${loyaltyTransactions.createdAt} >= ${sinceTs}), 0)::int`,
      redemptions30: sql<number>`count(*) filter (where ${loyaltyTransactions.kind} = 'REDEEM' and ${loyaltyTransactions.createdAt} >= ${sinceTs})::int`,
    })
    .from(loyaltyTransactions)
    .where(scope);
  // Puntos sin canjear de toda la cadena (el saldo no es de una sucursal).
  const [o] = await db.execute<{ outstanding: number }>(sql`
    select coalesce(sum(points), 0)::int as outstanding from loyalty_transactions
    where restaurant_id in ${orgRestaurants(user.organizationId)}
  `);
  const recent = await db
    .select({
      id: loyaltyTransactions.id,
      phone: loyaltyTransactions.phone,
      kind: loyaltyTransactions.kind,
      points: loyaltyTransactions.points,
      rewardName: loyaltyTransactions.rewardName,
      createdAt: loyaltyTransactions.createdAt,
      restaurantName: restaurants.name,
    })
    .from(loyaltyTransactions)
    .innerJoin(restaurants, eq(restaurants.id, loyaltyTransactions.restaurantId))
    .where(and(scope, gte(loyaltyTransactions.createdAt, since)))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(25);
  return {
    members: Number(t?.members ?? 0),
    outstanding: user.role === "ADMIN" ? Number(o?.outstanding ?? 0) : null,
    earned30: Number(t?.earned30 ?? 0),
    redeemed30: Number(t?.redeemed30 ?? 0),
    redemptions30: Number(t?.redemptions30 ?? 0),
    recent,
  };
}

/** Premios de la cadena; `activeOnly` para el formulario de canje. */
export async function listRewards(organizationId: string, opts: { activeOnly?: boolean } = {}) {
  return db.query.loyaltyRewards.findMany({
    where: and(eq(loyaltyRewards.organizationId, organizationId), opts.activeOnly ? eq(loyaltyRewards.active, true) : undefined),
    orderBy: (r, { asc }) => [asc(r.pointsCost), asc(r.name)],
  });
}
