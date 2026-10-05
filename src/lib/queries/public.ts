import "server-only";
import { and, eq } from "drizzle-orm";
import type { RunnerSurvey } from "@/components/survey/types";
import { db } from "@/db";
import { restaurants, surveys } from "@/db/schema";

export async function getRestaurantBySlug(slug: string) {
  return db.query.restaurants.findFirst({
    where: eq(restaurants.slug, slug),
    columns: { logoData: false },
  });
}

/** Encuesta activa del restaurante, en el formato que usa la pantalla del comensal. */
export async function getActiveRunnerSurvey(restaurantId: string): Promise<RunnerSurvey | null> {
  const s = await db.query.surveys.findFirst({
    where: and(eq(surveys.restaurantId, restaurantId), eq(surveys.status, "ACTIVE")),
    with: { questions: { orderBy: (q, { asc }) => asc(q.position) } },
  });
  if (!s || s.questions.length === 0) return null;
  return {
    id: s.id,
    welcomeText: s.welcomeText,
    closingText: s.closingText,
    questions: s.questions.map((q) => ({ id: q.id, type: q.type, text: q.text, required: q.required, options: q.options })),
  };
}
