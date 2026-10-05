import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { db } from "@/db";
import * as s from "@/db/schema";
import { kioskPinHash } from "@/lib/crypto";
import { BASE_TEMPLATE } from "@/lib/survey-template";

let migrated = false;

export async function resetDb() {
  if (!migrated) {
    const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    await client.end();
    migrated = true;
  }
  await db.execute(
    sql`TRUNCATE answers, responses, questions, surveys, devices, user_restaurants, password_reset_tokens, signup_invites, rate_limits, restaurants, users CASCADE`,
  );
}

export async function createRestaurantWithSurvey(slug: string, status: "ACTIVE" | "DRAFT" | "ARCHIVED" = "ACTIVE") {
  const id = randomUUID();
  const [restaurant] = await db
    .insert(s.restaurants)
    .values({ id, name: `R ${slug}`, slug, kioskPinHash: kioskPinHash(id, "1234") })
    .returning();
  const [survey] = await db
    .insert(s.surveys)
    .values({
      restaurantId: id,
      title: "Base",
      status,
      publishedAt: new Date(),
      archivedAt: status === "ARCHIVED" ? new Date() : null,
    })
    .returning();
  const questions = await db
    .insert(s.questions)
    .values(BASE_TEMPLATE.map((q, i) => ({ ...q, surveyId: survey.id, position: i })))
    .returning();
  const byMetric = Object.fromEntries(questions.map((q) => [q.metric, q.id])) as Record<s.QuestionMetric, string>;
  return { restaurant, survey, questions, byMetric };
}

export function answersFor(byMetric: Record<string, string>, over: Partial<Record<string, unknown>> = {}) {
  return {
    [byMetric.FIRST_VISIT]: true,
    [byMetric.FOOD]: 5,
    [byMetric.CAPTAIN_VISIT]: false,
    [byMetric.SERVICE]: 4,
    [byMetric.RECOMMEND]: 9,
    ...over,
  } as Record<string, boolean | number | string>;
}
