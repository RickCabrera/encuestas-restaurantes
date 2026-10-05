import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { answers, devices, responses, surveys } from "@/db/schema";
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
});
