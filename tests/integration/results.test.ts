import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { canAccessRestaurant } from "@/lib/authz";
import { dayInTz } from "@/lib/dates";
import type { Filters } from "@/lib/filters";
import { rateLimit } from "@/lib/rate-limit";
import { submitResponse } from "@/lib/submit-response";
import { answersFor, createRestaurantWithSurvey, resetDb } from "./helpers";

// parseFilters/responseWhere importan next/headers; aquí solo se usa responseWhere.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

const { getSummary, getRanking, listComments } = await import("@/lib/queries/results");

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
});

const today = dayInTz(new Date());
const filters = (over: Partial<Filters> = {}): Filters => ({
  restaurantId: null,
  from: "2020-01-01",
  to: today,
  channel: null,
  surveyId: null,
  table: null,
  lowOnly: false,
  q: null,
  page: 1,
  ...over,
});

const admin: SessionUser = { id: "a", name: "A", email: "a@x", role: "ADMIN", notifyLowScores: false, restaurantIds: null };

describe("alcance de gerentes (autorización en backend)", () => {
  it("un gerente solo ve datos de sus restaurantes", async () => {
    const a = await createRestaurantWithSurvey("a");
    const b = await createRestaurantWithSurvey("b");
    for (let i = 0; i < 3; i++)
      await submitResponse(
        { id: randomUUID(), surveyId: a.survey.id, answers: answersFor(a.byMetric, { [a.byMetric.COMMENT]: "Muy rico" }) },
        { channel: "QR" },
      );
    for (let i = 0; i < 2; i++)
      await submitResponse(
        { id: randomUUID(), surveyId: b.survey.id, answers: answersFor(b.byMetric, { [b.byMetric.COMMENT]: "Frío" }) },
        { channel: "QR" },
      );

    const manager: SessionUser = { ...admin, role: "MANAGER", restaurantIds: [a.restaurant.id] };
    expect((await getSummary(filters(), admin)).responses).toBe(5);
    expect((await getSummary(filters(), manager)).responses).toBe(3);
    // Aunque pida el restaurante B explícitamente, no ve nada.
    expect((await getSummary(filters({ restaurantId: b.restaurant.id }), manager)).responses).toBe(0);
    expect((await getRanking(filters(), manager)).map((r) => r.restaurantId)).toEqual([a.restaurant.id]);
    expect((await listComments(filters(), manager)).total).toBe(3);

    const noAccess: SessionUser = { ...admin, role: "MANAGER", restaurantIds: [] };
    expect((await getSummary(filters(), noAccess)).responses).toBe(0);
    expect(canAccessRestaurant(manager, b.restaurant.id)).toBe(false);
  });
});

describe("indicadores", () => {
  it("calcula promedios, NPS y porcentajes", async () => {
    const a = await createRestaurantWithSurvey("a");
    const m = a.byMetric;
    const send = (over: Record<string, unknown>) =>
      submitResponse({ id: randomUUID(), surveyId: a.survey.id, answers: answersFor(m, over) }, { channel: "QR" });
    await send({ [m.FOOD]: 5, [m.SERVICE]: 4, [m.RECOMMEND]: 10, [m.FIRST_VISIT]: true, [m.CAPTAIN_VISIT]: true });
    await send({ [m.FOOD]: 3, [m.SERVICE]: 2, [m.RECOMMEND]: 5, [m.FIRST_VISIT]: false, [m.CAPTAIN_VISIT]: false });
    const s = await getSummary(filters(), admin);
    expect(s).toMatchObject({
      responses: 2,
      food: 4,
      service: 3,
      nps: 0,
      promoters: 1,
      detractors: 1,
      captainVisitPct: 50,
      firstVisitPct: 50,
      lowScorePct: 50,
    });
  });
});

describe("rateLimit", () => {
  it("bloquea al pasar el límite dentro de la ventana", async () => {
    const key = `t:${randomUUID()}`;
    expect((await rateLimit(key, 2, 60)).ok).toBe(true);
    expect((await rateLimit(key, 2, 60)).ok).toBe(true);
    const third = await rateLimit(key, 2, 60);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThan(0);
  });
});
