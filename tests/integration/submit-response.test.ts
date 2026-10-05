import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/responses/route";
import { db } from "@/db";
import { answers, devices, responses, surveys } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { SubmitError, submitResponse } from "@/lib/submit-response";
import { answersFor, createRestaurantWithSurvey, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
});

describe("submitResponse (QR)", () => {
  it("guarda respuesta y respuestas por pregunta", async () => {
    const { survey, byMetric } = await createRestaurantWithSurvey("uno");
    const id = randomUUID();
    const r = await submitResponse({ id, surveyId: survey.id, answers: answersFor(byMetric), tableRef: "12" }, { channel: "QR" });
    expect(r).toMatchObject({ ok: true, duplicate: false, lowScore: false });
    const saved = await db.query.responses.findFirst({ where: eq(responses.id, id) });
    expect(saved).toMatchObject({ channel: "QR", tableRef: "12", lowScore: false });
    const [{ n }] = await db.select({ n: count() }).from(answers).where(eq(answers.responseId, id));
    expect(n).toBe(5);
  });

  it("es idempotente por id", async () => {
    const { survey, byMetric } = await createRestaurantWithSurvey("uno");
    const input = { id: randomUUID(), surveyId: survey.id, answers: answersFor(byMetric) };
    await submitResponse(input, { channel: "QR" });
    const again = await submitResponse(input, { channel: "QR" });
    expect(again.duplicate).toBe(true);
    const [{ n }] = await db.select({ n: count() }).from(responses);
    expect(n).toBe(1);
  });

  it("marca calificación baja y prepara la alerta", async () => {
    const { survey, byMetric } = await createRestaurantWithSurvey("uno");
    const r = await submitResponse(
      { id: randomUUID(), surveyId: survey.id, answers: answersFor(byMetric, { [byMetric.FOOD]: 1 }) },
      { channel: "QR" },
    );
    expect(r.lowScore).toBe(true);
    expect(typeof r.alert).toBe("function");
  });

  it("rechaza encuestas en borrador o archivadas", async () => {
    const draft = await createRestaurantWithSurvey("dos", "DRAFT");
    await expect(
      submitResponse({ id: randomUUID(), surveyId: draft.survey.id, answers: answersFor(draft.byMetric) }, { channel: "QR" }),
    ).rejects.toBeInstanceOf(SubmitError);
    const archived = await createRestaurantWithSurvey("tres", "ARCHIVED");
    await expect(
      submitResponse(
        { id: randomUUID(), surveyId: archived.survey.id, answers: answersFor(archived.byMetric) },
        { channel: "QR" },
      ),
    ).rejects.toThrow("ya no está activa");
  });

  it("rechaza respuestas incompletas", async () => {
    const { survey, byMetric } = await createRestaurantWithSurvey("uno");
    await expect(
      submitResponse({ id: randomUUID(), surveyId: survey.id, answers: { [byMetric.FOOD]: 5 } }, { channel: "QR" }),
    ).rejects.toThrow("obligatoria");
  });

  it("ignora en silencio a los bots (honeypot)", async () => {
    const { survey, byMetric } = await createRestaurantWithSurvey("uno");
    const r = await submitResponse(
      { id: randomUUID(), surveyId: survey.id, answers: answersFor(byMetric), website: "http://spam" },
      { channel: "QR" },
    );
    expect(r.ok).toBe(true);
    const [{ n }] = await db.select({ n: count() }).from(responses);
    expect(n).toBe(0);
  });
});

describe("submitResponse (tablet)", () => {
  it("acepta la respuesta si el comensal empezó antes de que se archivara la encuesta", async () => {
    const a = await createRestaurantWithSurvey("a");
    const [dev] = await db.insert(devices).values({ restaurantId: a.restaurant.id, name: "T" }).returning();
    const archivedAt = new Date(Date.now() - 60 * 1000);
    await db.update(surveys).set({ status: "ARCHIVED", archivedAt }).where(eq(surveys.id, a.survey.id));
    const r = await submitResponse(
      {
        id: randomUUID(),
        surveyId: a.survey.id,
        answers: answersFor(a.byMetric),
        startedAt: new Date(archivedAt.getTime() - 30 * 1000).toISOString(),
        submittedAt: new Date().toISOString(),
      },
      { channel: "KIOSK", deviceId: dev.id, restaurantId: a.restaurant.id },
    );
    expect(r.ok).toBe(true);
  });

  it("rechaza tablets de otro restaurante", async () => {
    const a = await createRestaurantWithSurvey("a");
    const b = await createRestaurantWithSurvey("b");
    const [dev] = await db.insert(devices).values({ restaurantId: b.restaurant.id, name: "T" }).returning();
    await expect(
      submitResponse(
        { id: randomUUID(), surveyId: a.survey.id, answers: answersFor(a.byMetric) },
        { channel: "KIOSK", deviceId: dev.id, restaurantId: b.restaurant.id },
      ),
    ).rejects.toThrow("no pertenece");
  });

  it("acepta respuestas offline respondidas antes de archivar la encuesta y conserva la hora original", async () => {
    const a = await createRestaurantWithSurvey("a");
    const [dev] = await db.insert(devices).values({ restaurantId: a.restaurant.id, name: "T" }).returning();
    const answeredAt = new Date(Date.now() - 2 * 3600 * 1000);
    await db
      .update(surveys)
      .set({ status: "ARCHIVED", archivedAt: new Date(Date.now() - 3600 * 1000) })
      .where(eq(surveys.id, a.survey.id));
    const id = randomUUID();
    await submitResponse(
      { id, surveyId: a.survey.id, answers: answersFor(a.byMetric), submittedAt: answeredAt.toISOString() },
      { channel: "KIOSK", deviceId: dev.id, restaurantId: a.restaurant.id },
    );
    const saved = await db.query.responses.findFirst({ where: eq(responses.id, id) });
    expect(saved?.channel).toBe("KIOSK");
    expect(Math.abs(saved!.submittedAt.getTime() - answeredAt.getTime())).toBeLessThan(1000);

    // Respondida después de archivar: se rechaza.
    await expect(
      submitResponse(
        { id: randomUUID(), surveyId: a.survey.id, answers: answersFor(a.byMetric), submittedAt: new Date().toISOString() },
        { channel: "KIOSK", deviceId: dev.id, restaurantId: a.restaurant.id },
      ),
    ).rejects.toThrow("ya no está activa");
  });

  it("guarda la mesa que escribió el mesero, o null si empezó sin mesa", async () => {
    const a = await createRestaurantWithSurvey("a");
    const [dev] = await db.insert(devices).values({ restaurantId: a.restaurant.id, name: "T" }).returning();
    const ctx = { channel: "KIOSK" as const, deviceId: dev.id, restaurantId: a.restaurant.id };
    const withTable = randomUUID();
    await submitResponse({ id: withTable, surveyId: a.survey.id, answers: answersFor(a.byMetric), tableRef: "5" }, ctx);
    expect(await db.query.responses.findFirst({ where: eq(responses.id, withTable) })).toMatchObject({
      channel: "KIOSK",
      deviceId: dev.id,
      tableRef: "5",
    });
    // Sin el campo (respuestas que ya estaban en la cola offline) o vacío: se guarda sin mesa.
    for (const tableRef of [undefined, null, ""]) {
      const id = randomUUID();
      await submitResponse({ id, surveyId: a.survey.id, answers: answersFor(a.byMetric), tableRef }, ctx);
      const saved = await db.query.responses.findFirst({ where: eq(responses.id, id) });
      expect(saved?.tableRef).toBeNull();
    }
  });
});

describe("POST /api/responses (tablet)", () => {
  const token = "tablet-token-0123456789abcdef";
  async function post(body: Record<string, unknown>) {
    return POST(
      new Request("http://localhost/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    );
  }

  it("valida la mesa igual que en QR: recorta espacios y rechaza más de 20 caracteres", async () => {
    // Evita el `after()` de limpieza ocasional, que solo existe dentro de una petición de Next.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const a = await createRestaurantWithSurvey("a");
    await db.insert(devices).values({ restaurantId: a.restaurant.id, name: "T", tokenHash: sha256(token) });
    const base = { surveyId: a.survey.id, answers: answersFor(a.byMetric) };

    const tooLong = await post({ ...base, id: randomUUID(), tableRef: "9".repeat(21) });
    expect(tooLong.status).toBe(400);
    const [{ n }] = await db.select({ n: count() }).from(responses);
    expect(n).toBe(0);

    const id = randomUUID();
    const ok = await post({ ...base, id, tableRef: " 12 " });
    expect(ok.status).toBe(200);
    const saved = await db.query.responses.findFirst({ where: eq(responses.id, id) });
    expect(saved).toMatchObject({ channel: "KIOSK", tableRef: "12" });
    vi.restoreAllMocks();
  });
});
