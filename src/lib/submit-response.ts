import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { answers, responses, surveys, userRestaurants, users } from "@/db/schema";
import { formatDateTime } from "./dates";
import { escapeHtml, sendEmail } from "./email";
import { logger } from "./logger";
import { AnswerValidationError, isLowScore, validateAnswers, type NormalizedAnswer, type RuleQuestion } from "./survey-rules";

export const submitSchema = z.object({
  id: z.uuid(),
  surveyId: z.uuid(),
  answers: z.record(z.string(), z.union([z.boolean(), z.number(), z.string().max(2000), z.null()])),
  startedAt: z.iso.datetime().optional(),
  submittedAt: z.iso.datetime().optional(),
  tableRef: z.string().trim().max(20).optional().nullable(),
  website: z.string().optional(), // honeypot
});

export type SubmitInput = z.infer<typeof submitSchema>;

export class SubmitError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const MAX_OFFLINE_AGE_MS = 7 * 24 * 3600 * 1000;

type Context = { channel: "QR" } | { channel: "KIOSK"; deviceId: string; restaurantId: string };

/**
 * Guarda una respuesta. Es idempotente por `id` (la cola offline del kiosko
 * puede reenviar la misma respuesta sin duplicarla).
 */
export async function submitResponse(input: SubmitInput, ctx: Context) {
  if (input.website) {
    logger.warn("response.honeypot", { surveyId: input.surveyId });
    return { ok: true as const, duplicate: false };
  }

  const existing = await db.query.responses.findFirst({ where: eq(responses.id, input.id), columns: { id: true } });
  if (existing) return { ok: true as const, duplicate: true };

  const survey = await db.query.surveys.findFirst({
    where: eq(surveys.id, input.surveyId),
    with: { questions: true, restaurant: { columns: { id: true, name: true, active: true } } },
  });
  if (!survey || survey.status === "DRAFT") throw new SubmitError("La encuesta no está disponible", 404);
  if (!survey.restaurant.active) throw new SubmitError("El restaurante no está recibiendo encuestas", 403);

  const now = Date.now();
  let submittedAt = new Date(now);
  if (ctx.channel === "KIOSK") {
    if (ctx.restaurantId !== survey.restaurantId) throw new SubmitError("La tablet no pertenece a este restaurante", 403);
    // Respuestas en cola offline: se aceptan aunque la encuesta se haya archivado después.
    const client = input.submittedAt ? Date.parse(input.submittedAt) : NaN;
    if (Number.isFinite(client) && client <= now + 5 * 60 * 1000 && client >= now - MAX_OFFLINE_AGE_MS) {
      submittedAt = new Date(Math.min(client, now));
    }
    // Se acepta si el comensal EMPEZÓ antes de que se archivara (la tablet pudo tener la versión
    // anterior en pantalla o en cola sin internet). Sin hora de inicio, se usa la de envío.
    const startedClient = input.startedAt ? Date.parse(input.startedAt) : NaN;
    const startedAtSafe =
      Number.isFinite(startedClient) && startedClient <= submittedAt.getTime() ? new Date(startedClient) : submittedAt;
    if (survey.status === "ARCHIVED" && (!survey.archivedAt || startedAtSafe > survey.archivedAt)) {
      throw new SubmitError("La encuesta ya no está activa", 409);
    }
  } else if (survey.status !== "ACTIVE") {
    throw new SubmitError("La encuesta ya no está activa", 409);
  }

  const rules: RuleQuestion[] = survey.questions.map((q) => ({
    id: q.id,
    type: q.type,
    required: q.required,
    metric: q.metric,
    options: q.options,
  }));

  let normalized: NormalizedAnswer[];
  try {
    normalized = validateAnswers(rules, input.answers);
  } catch (e) {
    if (e instanceof AnswerValidationError) throw new SubmitError(e.message, 422);
    throw e;
  }

  const started = input.startedAt ? Date.parse(input.startedAt) : NaN;
  const durationSec = Number.isFinite(started)
    ? Math.max(0, Math.min(3600, Math.round((submittedAt.getTime() - started) / 1000)))
    : null;
  const lowScore = isLowScore(rules, normalized);

  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(responses)
      .values({
        id: input.id,
        surveyId: survey.id,
        restaurantId: survey.restaurantId,
        channel: ctx.channel,
        deviceId: ctx.channel === "KIOSK" ? ctx.deviceId : null,
        // QR: viene en el enlace de la mesa. Tablet: lo escribe el mesero antes de entregarla.
        tableRef: input.tableRef || null,
        startedAt: Number.isFinite(started) ? new Date(started) : null,
        submittedAt,
        durationSec,
        lowScore,
      })
      .onConflictDoNothing()
      .returning({ id: responses.id });
    if (rows.length === 0) return false; // carrera: ya existía
    if (normalized.length) await tx.insert(answers).values(normalized.map((a) => ({ ...a, responseId: input.id })));
    return true;
  });

  if (!inserted) return { ok: true as const, duplicate: true };

  logger.info("response.saved", {
    responseId: input.id,
    surveyId: survey.id,
    restaurantId: survey.restaurantId,
    channel: ctx.channel,
    lowScore,
    durationSec,
  });

  return {
    ok: true as const,
    duplicate: false,
    lowScore,
    alert: lowScore
      ? () =>
          sendLowScoreAlert({
            restaurantId: survey.restaurantId,
            restaurantName: survey.restaurant.name,
            responseId: input.id,
            submittedAt,
            lines: normalized.map((a) => {
              const q = survey.questions.find((x) => x.id === a.questionId)!;
              const v = a.valueBool !== null ? (a.valueBool ? "Sí" : "No") : (a.valueNumber ?? a.valueText ?? "");
              return { question: q.text, value: String(v), position: q.position };
            }),
          })
      : undefined,
  };
}

async function sendLowScoreAlert(p: {
  restaurantId: string;
  restaurantName: string;
  responseId: string;
  submittedAt: Date;
  lines: { question: string; value: string; position: number }[];
}) {
  // Admins que quieren alertas + gerentes asignados a ese restaurante que las quieren.
  const admins = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.active, true), eq(users.notifyLowScores, true)));
  const managers = await db
    .select({ email: users.email })
    .from(users)
    .innerJoin(userRestaurants, eq(userRestaurants.userId, users.id))
    .where(
      and(
        eq(userRestaurants.restaurantId, p.restaurantId),
        eq(users.role, "MANAGER"),
        eq(users.active, true),
        eq(users.notifyLowScores, true),
      ),
    );
  const to = [...new Set([...admins, ...managers].map((u) => u.email))];
  if (to.length === 0) return;
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const link = `${base}/admin/responses/${p.responseId}`;
  const lines = [...p.lines].sort((a, b) => a.position - b.position);
  await sendEmail({
    to,
    subject: `Calificación baja en ${p.restaurantName}`,
    text: [
      `Llegó una calificación baja en ${p.restaurantName} (${formatDateTime(p.submittedAt)}).`,
      "",
      ...lines.map((l) => `• ${l.question}: ${l.value}`),
      "",
      `Ver respuesta: ${link}`,
    ].join("\n"),
    html: `<p>Llegó una calificación baja en <strong>${escapeHtml(p.restaurantName)}</strong> (${escapeHtml(
      formatDateTime(p.submittedAt),
    )}).</p><ul>${lines
      .map((l) => `<li>${escapeHtml(l.question)}: <strong>${escapeHtml(l.value)}</strong></li>`)
      .join("")}</ul><p><a href="${link}">Ver respuesta en el panel</a></p>`,
  });
}
