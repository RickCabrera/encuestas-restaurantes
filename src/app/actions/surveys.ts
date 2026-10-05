"use server";

import { and, count, eq, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { questions, responses, surveys } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin, type SessionUser } from "@/lib/auth";
import { canAccessRestaurant, restaurantScope } from "@/lib/authz";
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

const NOT_FOUND: ActionState = { error: "Encuesta no encontrada" };

/** Condición para tocar una encuesta: ese id y que su restaurante sea de la cadena del administrador. */
function ownSurvey(admin: SessionUser, id: string) {
  return and(eq(surveys.id, id), restaurantScope(admin, surveys.restaurantId));
}

/** La encuesta, o undefined si no existe o es de otra cadena (para el que pregunta es lo mismo). */
async function loadSurvey(admin: SessionUser, id: string) {
  if (!isUuid(id)) return undefined;
  return db.query.surveys.findFirst({ where: ownSurvey(admin, id) });
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
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { restaurantId, title, template } = parsed.data;
  if (!canAccessRestaurant(admin, restaurantId)) return { fieldErrors: { restaurantId: ["Restaurante no encontrado"] } };

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
  const admin = await requireAdmin();
  const survey = await loadSurvey(admin, id);
  if (!survey) return NOT_FOUND;
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
  const admin = await requireAdmin();
  const survey = await loadSurvey(admin, id);
  if (!survey) return NOT_FOUND;
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
  const admin = await requireAdmin();
  if (!(await loadSurvey(admin, id))) return NOT_FOUND;
  await db.update(surveys).set({ status: "ARCHIVED", archivedAt: new Date() }).where(ownSurvey(admin, id));
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Encuesta archivada." };
}

/** Copia la encuesta como borrador en uno o varios restaurantes. */
export async function duplicateSurveyAction(id: string, restaurantIds: string[]): Promise<ActionState & { newId?: string }> {
  const admin = await requireAdmin();
  const source = isUuid(id)
    ? await db.query.surveys.findFirst({
        where: ownSurvey(admin, id),
        with: { questions: { orderBy: (q, { asc }) => asc(q.position) } },
      })
    : undefined;
  if (!source) return NOT_FOUND;
  const targets = [...new Set(restaurantIds.filter(isUuid))];
  if (targets.length === 0) return { error: "Elige al menos un restaurante." };
  // Solo se copia a restaurantes de la misma cadena.
  if (!targets.every((t) => canAccessRestaurant(admin, t))) return { error: "Algún restaurante no existe." };

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
  const admin = await requireAdmin();
  const survey = await loadSurvey(admin, id);
  if (!survey) return NOT_FOUND;
  if (!canDeleteSurvey(survey.status, await responseCount(id))) {
    return { error: "Solo se pueden eliminar borradores sin respuestas." };
  }
  await db.delete(surveys).where(ownSurvey(admin, id));
  revalidatePath("/admin/surveys");
  redirect("/admin/surveys");
}
