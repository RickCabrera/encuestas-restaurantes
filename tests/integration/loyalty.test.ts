import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/responses/route";
import { db } from "@/db";
import * as s from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { adjustPoints, getBalance, getLoyaltyOverview, getMember, LoyaltyError, redeemReward } from "@/lib/loyalty";
import { exportChanges } from "@/lib/sync";
import { submitResponse } from "@/lib/submit-response";
import { answersFor, createOrg, createRestaurantWithSurvey, createUser, resetDb, sessionFor } from "./helpers";

beforeEach(resetDb);
afterAll(resetDb);

const PHONE = "5512345678";

async function chain(points = 10) {
  const org = await createOrg("Cadena");
  const one = await createRestaurantWithSurvey("uno", "ACTIVE", org.id);
  const two = await createRestaurantWithSurvey("dos", "ACTIVE", org.id);
  await db.update(s.restaurants).set({ loyaltyPoints: points }).where(eq(s.restaurants.id, one.restaurant.id));
  await db.update(s.restaurants).set({ loyaltyPoints: 25 }).where(eq(s.restaurants.id, two.restaurant.id));
  const admin = await createUser(org.id, "admin@c.test", "ADMIN");
  const manager = await createUser(org.id, "gerente@c.test", "MANAGER", { restaurantIds: [one.restaurant.id] });
  return { org, one, two, admin: await sessionFor(admin.id), manager: await sessionFor(manager.id) };
}

type R = Awaited<ReturnType<typeof createRestaurantWithSurvey>>;
const answer = (r: R, phone: string | null = PHONE, extra: Record<string, unknown> = {}) =>
  submitResponse(
    { id: randomUUID(), surveyId: r.survey.id, answers: answersFor(r.byMetric), ...(phone ? { phone } : {}), ...extra },
    { channel: "QR" },
  );

async function reward(organizationId: string, pointsCost: number, active = true) {
  const [r] = await db
    .insert(s.loyaltyRewards)
    .values({ organizationId, name: `Premio ${pointsCost}`, pointsCost, active })
    .returning();
  return r;
}

describe("ganar puntos al contestar", () => {
  it("da los puntos de la sucursal y devuelve el saldo", async () => {
    const c = await chain();
    const r = await answer(c.one);
    expect(r.loyalty).toEqual({ status: "earned", points: 10, balance: 10 });
    const [tx] = await db.select().from(s.loyaltyTransactions);
    expect(tx).toMatchObject({ phone: PHONE, kind: "EARN", points: 10, restaurantId: c.one.restaurant.id });
    expect(tx.responseId).not.toBeNull();
  });

  it("normaliza el celular (+52, espacios)", async () => {
    const c = await chain();
    await answer(c.one, "+52 1 55 1234 5678");
    expect(await getBalance(c.org.id, PHONE)).toBe(10);
  });

  it("una vez al día por sucursal: la segunda encuesta se guarda, pero sin puntos", async () => {
    const c = await chain();
    await answer(c.one);
    const again = await answer(c.one);
    expect(again.loyalty).toEqual({ status: "already_today", balance: 10 });
    const [{ n }] = await db.select({ n: count() }).from(s.responses);
    expect(n).toBe(2);
    const [{ t }] = await db.select({ t: count() }).from(s.loyaltyTransactions);
    expect(t).toBe(1);
  });

  it("dos envíos simultáneos del mismo celular no ganan doble", async () => {
    const c = await chain();
    const results = await Promise.all([answer(c.one), answer(c.one), answer(c.one)]);
    expect(results.filter((r) => r.loyalty?.status === "earned")).toHaveLength(1);
    expect(await getBalance(c.org.id, PHONE)).toBe(10);
  });

  it("el saldo es de toda la cadena: gana en otra sucursal el mismo día", async () => {
    const c = await chain();
    await answer(c.one);
    const r = await answer(c.two);
    expect(r.loyalty).toEqual({ status: "earned", points: 25, balance: 35 });
  });

  it("otra cadena lleva su propio saldo", async () => {
    const c = await chain();
    await answer(c.one);
    const other = await createOrg("Otra");
    const r3 = await createRestaurantWithSurvey("tres", "ACTIVE", other.id);
    await db.update(s.restaurants).set({ loyaltyPoints: 5 }).where(eq(s.restaurants.id, r3.restaurant.id));
    const r = await answer(r3);
    expect(r.loyalty).toEqual({ status: "earned", points: 5, balance: 5 });
    expect(await getBalance(c.org.id, PHONE)).toBe(10);
  });

  it("sin puntos configurados o sin celular no hay movimiento", async () => {
    const c = await chain(0);
    expect((await answer(c.one)).loyalty).toBeNull();
    expect((await answer(c.two, null)).loyalty).toBeNull();
    const [{ t }] = await db.select({ t: count() }).from(s.loyaltyTransactions);
    expect(t).toBe(0);
  });

  it("un celular inválido no impide guardar la encuesta", async () => {
    const c = await chain();
    const r = await answer(c.one, "123");
    expect(r.loyalty).toEqual({ status: "invalid_phone" });
    const [{ n }] = await db.select({ n: count() }).from(s.responses);
    expect(n).toBe(1);
  });

  it("tablet sin internet: cuenta el día en que se contestó", async () => {
    const c = await chain();
    const token = "tok-" + randomUUID();
    const [device] = await db
      .insert(s.devices)
      .values({ restaurantId: c.one.restaurant.id, name: "T", tokenHash: sha256(token), pairedAt: new Date() })
      .returning();
    const yesterday = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
    const ctx = { channel: "KIOSK" as const, deviceId: device.id, restaurantId: c.one.restaurant.id };
    const base = { surveyId: c.one.survey.id, answers: answersFor(c.one.byMetric), phone: PHONE };
    await submitResponse({ ...base, id: randomUUID(), startedAt: yesterday, submittedAt: yesterday }, ctx);
    const today = await submitResponse({ ...base, id: randomUUID() }, ctx);
    expect(today.loyalty).toEqual({ status: "earned", points: 10, balance: 20 });
  });

  it("la API devuelve el resultado de los puntos al celular del comensal", async () => {
    const c = await chain();
    const res = await POST(
      new Request("http://x/api/responses", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" },
        body: JSON.stringify({ id: randomUUID(), surveyId: c.one.survey.id, answers: answersFor(c.one.byMetric), phone: PHONE }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, loyalty: { status: "earned", points: 10, balance: 10 } });
  });
});

describe("canjear", () => {
  it("descuenta el premio y no deja canjear sin saldo", async () => {
    const c = await chain();
    await answer(c.one);
    await answer(c.two); // 35
    const cheap = await reward(c.org.id, 30);
    const r = await redeemReward(c.manager, { phone: PHONE, restaurantId: c.one.restaurant.id, rewardId: cheap.id });
    expect(r.balance).toBe(5);
    await expect(
      redeemReward(c.manager, { phone: PHONE, restaurantId: c.one.restaurant.id, rewardId: cheap.id }),
    ).rejects.toThrow("No le alcanza");
    const m = await getMember(c.manager, PHONE);
    expect(m).toMatchObject({ balance: 5, earned: 35, visits: 2, redemptions: 1 });
    expect(m!.history[0]).toMatchObject({ kind: "REDEEM", points: -30, rewardName: "Premio 30", createdByName: "gerente" });
  });

  it("canjes simultáneos no sobregiran", async () => {
    const c = await chain();
    await answer(c.one); // 10
    const rw = await reward(c.org.id, 10);
    const tries = await Promise.allSettled(
      [1, 2, 3].map(() => redeemReward(c.admin, { phone: PHONE, restaurantId: c.one.restaurant.id, rewardId: rw.id })),
    );
    expect(tries.filter((t) => t.status === "fulfilled")).toHaveLength(1);
    expect(await getBalance(c.org.id, PHONE)).toBe(0);
  });

  it("el gerente solo canjea en sus sucursales; premios de otra cadena o desactivados no", async () => {
    const c = await chain();
    await answer(c.one);
    const rw = await reward(c.org.id, 5);
    await expect(
      redeemReward(c.manager, { phone: PHONE, restaurantId: c.two.restaurant.id, rewardId: rw.id }),
    ).rejects.toBeInstanceOf(LoyaltyError);
    const off = await reward(c.org.id, 5, false);
    await expect(redeemReward(c.manager, { phone: PHONE, restaurantId: c.one.restaurant.id, rewardId: off.id })).rejects.toThrow(
      "ya no está disponible",
    );
    const other = await createOrg("Otra");
    const foreign = await reward(other.id, 1);
    await expect(
      redeemReward(c.manager, { phone: PHONE, restaurantId: c.one.restaurant.id, rewardId: foreign.id }),
    ).rejects.toThrow("ya no está disponible");
    expect(await getBalance(c.org.id, PHONE)).toBe(10);
  });
});

describe("ajustes y resumen", () => {
  it("solo el administrador ajusta y el saldo no queda en negativo", async () => {
    const c = await chain();
    await answer(c.one);
    await expect(
      adjustPoints(c.manager, { phone: PHONE, restaurantId: c.one.restaurant.id, points: 50, note: "regalo" }),
    ).rejects.toThrow("administrador");
    await expect(
      adjustPoints(c.admin, { phone: PHONE, restaurantId: c.one.restaurant.id, points: -11, note: "error" }),
    ).rejects.toThrow("negativo");
    const r = await adjustPoints(c.admin, { phone: PHONE, restaurantId: c.one.restaurant.id, points: 40, note: "Compensación" });
    expect(r.balance).toBe(50);
  });

  it("el resumen del gerente cuenta solo sus sucursales", async () => {
    const c = await chain();
    await answer(c.one);
    await answer(c.two, "3312345678");
    const mine = await getLoyaltyOverview(c.manager);
    expect(mine).toMatchObject({ members: 1, earned30: 10, outstanding: null });
    expect(mine.recent).toHaveLength(1);
    const all = await getLoyaltyOverview(c.admin);
    expect(all).toMatchObject({ members: 2, earned30: 35, outstanding: 35 });
  });
});

describe("sincronización PC ↔ nube", () => {
  it("exporta premios y movimientos solo de la cadena", async () => {
    const c = await chain();
    await answer(c.one);
    await reward(c.org.id, 10);
    const other = await createOrg("Otra");
    await reward(other.id, 99);
    const batch = await exportChanges(c.org.id);
    expect(batch.tables.loyalty_rewards.map((r) => r.points_cost)).toEqual([10]);
    expect(batch.tables.loyalty_transactions).toHaveLength(1);
    expect(batch.tables.loyalty_transactions[0]).toMatchObject({ phone: PHONE, kind: "EARN", points: 10 });
  });
});
