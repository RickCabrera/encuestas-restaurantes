"use server";

import { and, count, eq, inArray, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { questions, responses, restaurants, surveys } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { canDeleteSurvey, canEditSurvey } from "@/lib/survey-rules";
import { type SurveyInput, surveyInputSchema } from "@/lib/survey-schema";
import { BASE_TEMPLATE, DEFAULT_CLOSING, DEFAULT_WELCOME } from "@/lib/survey-template";

async function nextVersion(tx: Tx, restaurantId: string) {
  const [row] = await tx
    .select({ v: max(surveys.version) })
    .from(surveys)
    .where(eq(surveys.restaurantId, restaurantId));
  return (row?.v ?? 0) + 1;
}

async function responseCount(surveyId: string) {
  const [row] = await db.select({ n: count() }).from(responses).where(eq(responses.surveyId, surveyId));
  return row.n;
}

async function loadSurvey(id: string) {
  if (!isUuid(id)) throw new Error("Encuesta no encontrada");
  const s = await db.query.surveys.findFirst({ where: eq(surveys.id, id) });
  if (!s) throw new Error("Encuesta no encontrada");
  return s;
}

function toQuestionRows(surveyId: string, qs: SurveyInput["questions"]) {
  return qs.map((q, i) => ({
    surveyId,
    position: i,
    type: q.type,
    text: q.text,
    required: q.required,
    metric: q.metric,
    options: q.type === "SINGLE_CHOICE" ? { choices: (q.choices ?? []).filter(Boolean) } : null,
  }));
}

const createSchema = z.object({
  restaurantId: z.string().refine(isUuid, "Elige un restaurante"),
  title: z.string().trim().min(3, "Escribe un título").max(100),
  template: z.enum(["base", "blank"]),
});

export async function createSurveyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { restaurantId, title, template } = parsed.data;
  const r = await db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId), columns: { id: true } });
  if (!r) return { fieldErrors: { restaurantId: ["Restaurante no encontrado"] } };

  const id = await db.transaction(async (tx) => {
    const [s] = await tx
      .insert(surveys)
      .values({
        restaurantId,
        title,
        welcomeText: DEFAULT_WELCOME,
        closingText: DEFAULT_CLOSING,
        version: await nextVersion(tx, restaurantId),
      })
      .returning({ id: surveys.id });
    const qs =
      template === "base"
        ? BASE_TEMPLATE
        : [{ type: "RATING_5" as const, text: "¿Cómo calificas tu experiencia?", required: true, metric: "NONE" as const }];
    await tx.insert(questions).values(qs.map((q, i) => ({ ...q, surveyId: s.id, position: i })));
    return s.id;
  });
  logger.info("survey.created", { surveyId: id, restaurantId });
  redirect(`/admin/surveys/${id}`);
}

export async function saveSurveyAction(id: string, input: SurveyInput): Promise<ActionState> {
  await requireAdmin();
  const survey = await loadSurvey(id);
  if (!canEditSurvey(await responseCount(id))) {
    return { error: "Esta encuesta ya tiene respuestas y no se puede editar. Duplícala como nueva versión." };
  }
  const parsed = surveyInputSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first.path[0] === "questions" && typeof first.path[1] === "number" ? `Pregunta ${first.path[1] + 1}: ` : "";
    return { error: `${where}${first.message}` };
  }
  const d = parsed.data;
  await db.transaction(async (tx) => {
    await tx
      .update(surveys)
      .set({ title: d.title, welcomeText: d.welcomeText, closingText: d.closingText, updatedAt: new Date() })
      .where(eq(surveys.id, survey.id));
    await tx.delete(questions).where(eq(questions.surveyId, survey.id));
    await tx.insert(questions).values(toQuestionRows(survey.id, d.questions));
  });
  revalidatePath(`/admin/surveys/${id}`);
  return { ok: true, message: "Cambios guardados." };
}

export async function publishSurveyAction(id: string): Promise<ActionState> {
  await requireAdmin();
  const survey = await loadSurvey(id);
  const [{ n }] = await db.select({ n: count() }).from(questions).where(eq(questions.surveyId, id));
  if (n === 0) return { error: "Agrega al menos una pregunta antes de publicar." };
  await db.transaction(async (tx) => {
    await tx
      .update(surveys)
      .set({ status: "ARCHIVED", archivedAt: new Date() })
      .where(and(eq(surveys.restaurantId, survey.restaurantId), eq(surveys.status, "ACTIVE")));
    await tx
      .update(surveys)
      .set({ status: "ACTIVE", publishedAt: sql`coalesce(${surveys.publishedAt}, now())`, archivedAt: null })
      .where(eq(surveys.id, id));
  });
  logger.info("survey.published", { surveyId: id, restaurantId: survey.restaurantId });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Encuesta publicada. Las tablets la tomarán en su siguiente ciclo." };
}

export async function archiveSurveyAction(id: string): Promise<ActionState> {
  await requireAdmin();
  await loadSurvey(id);
  await db.update(surveys).set({ status: "ARCHIVED", archivedAt: new Date() }).where(eq(surveys.id, id));
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Encuesta archivada." };
}

/** Copia la encuesta como borrador en uno o varios restaurantes. */
export async function duplicateSurveyAction(id: string, restaurantIds: string[]): Promise<ActionState & { newId?: string }> {
  await requireAdmin();
  const source = await db.query.surveys.findFirst({
    where: eq(surveys.id, id),
    with: { questions: { orderBy: (q, { asc }) => asc(q.position) } },
  });
  if (!source) return { error: "Encuesta no encontrada" };
  const targets = restaurantIds.filter(isUuid);
  if (targets.length === 0) return { error: "Elige al menos un restaurante." };
  const valid = await db.select({ id: restaurants.id }).from(restaurants).where(inArray(restaurants.id, targets));
  if (valid.length !== targets.length) return { error: "Algún restaurante no existe." };

  const created = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const restaurantId of targets) {
      const [s] = await tx
        .insert(surveys)
        .values({
          restaurantId,
          title: source.title,
          welcomeText: source.welcomeText,
          closingText: source.closingText,
          version: await nextVersion(tx, restaurantId),
        })
        .returning({ id: surveys.id });
      if (source.questions.length) {
        await tx.insert(questions).values(
          source.questions.map((q) => ({
            surveyId: s.id,
            position: q.position,
            type: q.type,
            text: q.text,
            required: q.required,
            metric: q.metric,
            options: q.options,
          })),
        );
      }
      ids.push(s.id);
    }
    return ids;
  });
  logger.info("survey.duplicated", { from: id, to: created });
  revalidatePath("/admin/surveys");
  return {
    ok: true,
    newId: created.length === 1 ? created[0] : undefined,
    message: created.length === 1 ? "Borrador creado." : `Se crearon ${created.length} borradores.`,
  };
}

export async function deleteSurveyAction(id: string): Promise<ActionState> {
  await requireAdmin();
  const survey = await loadSurvey(id);
  if (!canDeleteSurvey(survey.status, await responseCount(id))) {
    return { error: "Solo se pueden eliminar borradores sin respuestas." };
  }
  await db.delete(surveys).where(eq(surveys.id, id));
  revalidatePath("/admin/surveys");
  redirect("/admin/surveys");
}
