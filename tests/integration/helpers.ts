import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { db } from "@/db";
import * as s from "@/db/schema";
import { kioskPinHash, randomToken, sha256 } from "@/lib/crypto";
import { createInvite } from "@/lib/invites";
import { buildSessionUser, type SessionUser } from "@/lib/session-user";
import { submitResponse } from "@/lib/submit-response";
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
    sql`TRUNCATE answers, responses, questions, surveys, devices, user_restaurants, password_reset_tokens, signup_invites, rate_limits, restaurants, users, organizations CASCADE`,
  );
}

export async function createOrg(name: string) {
  const [org] = await db.insert(s.organizations).values({ name }).returning();
  return org;
}

/** Cadena por omisión para las pruebas que no tratan de cadenas. */
async function defaultOrgId() {
  const existing = await db.query.organizations.findFirst({ where: eq(s.organizations.name, "Pruebas") });
  return (existing ?? (await createOrg("Pruebas"))).id;
}

export async function createRestaurantWithSurvey(
  slug: string,
  status: "ACTIVE" | "DRAFT" | "ARCHIVED" = "ACTIVE",
  organizationId?: string,
) {
  const id = randomUUID();
  const [restaurant] = await db
    .insert(s.restaurants)
    .values({
      id,
      organizationId: organizationId ?? (await defaultOrgId()),
      name: `R ${slug}`,
      slug,
      kioskPinHash: kioskPinHash(id, "1234"),
    })
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

// Un solo hash para todas las cuentas de prueba: bcrypt es lento a propósito.
const PASSWORD_HASH = bcrypt.hashSync("Secreta12345", 4);

export async function createUser(
  organizationId: string,
  email: string,
  role: s.UserRole,
  opts: { restaurantIds?: string[]; notifyLowScores?: boolean } = {},
) {
  const [user] = await db
    .insert(s.users)
    .values({
      organizationId,
      name: email.split("@")[0],
      email,
      role,
      passwordHash: PASSWORD_HASH,
      notifyLowScores: opts.notifyLowScores ?? true,
    })
    .returning();
  if (opts.restaurantIds?.length) {
    await db.insert(s.userRestaurants).values(opts.restaurantIds.map((restaurantId) => ({ userId: user.id, restaurantId })));
  }
  return user;
}

/** El mismo usuario de sesión que arma el panel al leer la cookie. */
export async function sessionFor(userId: string): Promise<SessionUser> {
  const user = await db.query.users.findFirst({ where: eq(s.users.id, userId) });
  const session = user ? await buildSessionUser(user) : null;
  if (!session) throw new Error("usuario de prueba sin sesión");
  return session;
}

/** Sesión de administrador que ve exactamente esos restaurantes (para pruebas que no tratan de cadenas). */
export async function adminSessionOver(restaurantIds: string[]): Promise<SessionUser> {
  return {
    id: randomUUID(),
    name: "A",
    email: "a@x",
    role: "ADMIN",
    notifyLowScores: false,
    organizationId: await defaultOrgId(),
    organizationName: "Pruebas",
    restaurantIds,
  };
}

/**
 * Una cadena completa: administrador, gerente (solo del primer restaurante), dos restaurantes con
 * encuesta activa y un borrador, una tablet vinculada, respuestas con comentario, un logo y una
 * invitación pendiente. `key` distingue sus correos, slugs y textos de los de otra cadena.
 */
export async function seedChain(name: string, key: string) {
  const org = await createOrg(name);
  const one = await createRestaurantWithSurvey(`${key}-uno`, "ACTIVE", org.id);
  const two = await createRestaurantWithSurvey(`${key}-dos`, "ACTIVE", org.id);
  const logo = Buffer.from(`logo-${key}`);
  await db
    .update(s.restaurants)
    .set({ name: `Restaurante ${key} uno`, logoData: logo, logoMime: "image/png", logoUpdatedAt: new Date() })
    .where(eq(s.restaurants.id, one.restaurant.id));
  await db
    .update(s.restaurants)
    .set({ name: `Restaurante ${key} dos` })
    .where(eq(s.restaurants.id, two.restaurant.id));

  const [draft] = await db
    .insert(s.surveys)
    .values({ restaurantId: one.restaurant.id, title: `Borrador ${key}`, status: "DRAFT", version: 2 })
    .returning();
  await db.insert(s.questions).values({ surveyId: draft.id, position: 0, type: "RATING_5", text: "¿Qué tal?", metric: "NONE" });

  const deviceToken = randomToken();
  const [device] = await db
    .insert(s.devices)
    .values({ restaurantId: one.restaurant.id, name: `Tablet ${key}`, tokenHash: sha256(deviceToken), pairedAt: new Date() })
    .returning();

  const admin = await createUser(org.id, `admin@${key}.test`, "ADMIN");
  const manager = await createUser(org.id, `gerente@${key}.test`, "MANAGER", { restaurantIds: [one.restaurant.id] });

  const responseIds: string[] = [];
  for (const r of [one, one, two]) {
    const id = randomUUID();
    await submitResponse(
      { id, surveyId: r.survey.id, answers: answersFor(r.byMetric, { [r.byMetric.COMMENT]: `Comentario ${key}` }) },
      { channel: "QR" },
    );
    responseIds.push(id);
  }

  const invite = await createInvite({ organizationId: org.id, role: "ADMIN" });

  return {
    org,
    key,
    one,
    two,
    draft,
    device,
    deviceToken,
    logo,
    admin,
    manager,
    responseIds,
    invite,
    /** En orden alfabético, como los lista el panel. */
    restaurantNames: [`Restaurante ${key} dos`, `Restaurante ${key} uno`],
  };
}

export type Chain = Awaited<ReturnType<typeof seedChain>>;

const TABLES = [
  "organizations",
  "users",
  "restaurants",
  "user_restaurants",
  "surveys",
  "questions",
  "devices",
  "responses",
  "answers",
  "signup_invites",
  "password_reset_tokens",
] as const;

/**
 * Huella de TODAS las filas de una cadena (un hash por tabla). Si cambia cualquier columna de
 * cualquier fila, o aparece o desaparece una fila, la huella cambia. `last_seen_at` de las tablets
 * se ignora: lo actualiza la propia tablet al conectarse.
 */
export async function chainFingerprint(orgId: string) {
  const rest = sql`(select id from restaurants where organization_id = ${orgId})`;
  const usr = sql`(select id from users where organization_id = ${orgId})`;
  const srv = sql`(select id from surveys where restaurant_id in ${rest})`;
  const scope: Record<(typeof TABLES)[number], ReturnType<typeof sql>> = {
    organizations: sql`t.id = ${orgId}`,
    users: sql`t.organization_id = ${orgId}`,
    restaurants: sql`t.organization_id = ${orgId}`,
    user_restaurants: sql`(t.user_id in ${usr} or t.restaurant_id in ${rest})`,
    surveys: sql`t.restaurant_id in ${rest}`,
    questions: sql`t.survey_id in ${srv}`,
    devices: sql`t.restaurant_id in ${rest}`,
    responses: sql`t.restaurant_id in ${rest}`,
    answers: sql`t.response_id in (select id from responses where restaurant_id in ${rest})`,
    signup_invites: sql`(t.organization_id = ${orgId} or t.used_by_user_id in ${usr})`,
    password_reset_tokens: sql`t.user_id in ${usr}`,
  };
  const out: Record<string, string> = {};
  for (const table of TABLES) {
    const row = table === "devices" ? sql`(to_jsonb(t) - 'last_seen_at')` : sql`to_jsonb(t)`;
    const [r] = await db.execute<{ n: number; h: string | null }>(
      sql`select count(*)::int as n, md5(coalesce(string_agg(${row}::text, '|' order by ${row}::text), '')) as h from ${sql.identifier(table)} t where ${scope[table]}`,
    );
    out[table] = `${r.n}:${r.h}`;
  }
  return out;
}
