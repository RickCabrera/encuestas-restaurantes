import "server-only";
import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { answers, devices, questions, responses, restaurants } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { restaurantScope } from "@/lib/authz";
import { addDays, APP_TIMEZONE } from "@/lib/dates";
import { type Filters, responseWhere } from "@/lib/filters";
import { isUuid } from "@/lib/ids";

export type MetricSummary = {
  responses: number;
  food: number | null;
  service: number | null;
  nps: number | null;
  npsCount: number;
  promoters: number;
  passives: number;
  detractors: number;
  captainVisitPct: number | null;
  firstVisitPct: number | null;
  lowScorePct: number | null;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Expresiones de agregación por indicador (se reutilizan en resumen, tendencia y ranking). */
const agg = {
  responses: sql<number>`count(distinct ${responses.id})::int`,
  low: sql<number>`count(distinct ${responses.id}) filter (where ${responses.lowScore})::int`,
  food: sql<string | null>`avg(${answers.valueNumber}) filter (where ${questions.metric} = 'FOOD')`,
  service: sql<string | null>`avg(${answers.valueNumber}) filter (where ${questions.metric} = 'SERVICE')`,
  npsN: sql<number>`count(*) filter (where ${questions.metric} = 'RECOMMEND' and ${answers.valueNumber} is not null)::int`,
  promoters: sql<number>`count(*) filter (where ${questions.metric} = 'RECOMMEND' and ${answers.valueNumber} >= 9)::int`,
  detractors: sql<number>`count(*) filter (where ${questions.metric} = 'RECOMMEND' and ${answers.valueNumber} <= 6)::int`,
  captainN: sql<number>`count(*) filter (where ${questions.metric} = 'CAPTAIN_VISIT' and ${answers.valueBool} is not null)::int`,
  captainYes: sql<number>`count(*) filter (where ${questions.metric} = 'CAPTAIN_VISIT' and ${answers.valueBool})::int`,
  firstN: sql<number>`count(*) filter (where ${questions.metric} = 'FIRST_VISIT' and ${answers.valueBool} is not null)::int`,
  firstYes: sql<number>`count(*) filter (where ${questions.metric} = 'FIRST_VISIT' and ${answers.valueBool})::int`,
};

type AggRow = { [K in keyof typeof agg]: unknown };

function toSummary(r: AggRow): MetricSummary {
  const npsN = Number(r.npsN);
  const promoters = Number(r.promoters);
  const detractors = Number(r.detractors);
  const total = Number(r.responses);
  return {
    responses: total,
    food: num(r.food),
    service: num(r.service),
    npsCount: npsN,
    promoters,
    detractors,
    passives: npsN - promoters - detractors,
    nps: npsN ? Math.round(((promoters - detractors) / npsN) * 100) : null,
    captainVisitPct: Number(r.captainN) ? (Number(r.captainYes) / Number(r.captainN)) * 100 : null,
    firstVisitPct: Number(r.firstN) ? (Number(r.firstYes) / Number(r.firstN)) * 100 : null,
    lowScorePct: total ? (Number(r.low) / total) * 100 : null,
  };
}

function baseQuery(where: SQL | undefined) {
  return db
    .select(agg)
    .from(responses)
    .leftJoin(answers, eq(answers.responseId, responses.id))
    .leftJoin(questions, eq(questions.id, answers.questionId))
    .where(where);
}

export async function getSummary(f: Filters, user: SessionUser) {
  const [row] = await baseQuery(responseWhere(f, user));
  return toSummary(row);
}

/** Mismo resumen para el periodo anterior de igual duración (para comparar). */
export async function getPreviousSummary(f: Filters, user: SessionUser) {
  const days = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86400000) + 1;
  const prev: Filters = { ...f, from: addDays(f.from, -days), to: addDays(f.from, -1) };
  return getSummary(prev, user);
}

export type TrendPoint = { bucket: string; responses: number; food: number | null; service: number | null; nps: number | null };

export async function getTrend(f: Filters, user: SessionUser): Promise<{ granularity: "day" | "week"; points: TrendPoint[] }> {
  const days = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86400000) + 1;
  const granularity = days > 62 ? "week" : "day";
  // Literales validados (no parámetros) para que SELECT y GROUP BY sean la misma expresión.
  const tz = /^[A-Za-z_/+-]+$/.test(APP_TIMEZONE) ? APP_TIMEZONE : "UTC";
  const bucket = sql<string>`to_char(date_trunc('${sql.raw(granularity)}', ${responses.submittedAt} at time zone '${sql.raw(tz)}'), 'YYYY-MM-DD')`;
  const rows = await db
    .select({ bucket, ...agg })
    .from(responses)
    .leftJoin(answers, eq(answers.responseId, responses.id))
    .leftJoin(questions, eq(questions.id, answers.questionId))
    .where(responseWhere(f, user))
    .groupBy(bucket)
    .orderBy(bucket);
  const byBucket = new Map(rows.map((r) => [r.bucket, toSummary(r)]));

  // Rellena días/semanas sin respuestas para que la gráfica no salte.
  const points: TrendPoint[] = [];
  let cursor = f.from;
  if (granularity === "week") {
    const d = new Date(`${f.from}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7;
    cursor = addDays(f.from, -dow);
  }
  while (cursor <= f.to) {
    const s = byBucket.get(cursor);
    points.push({
      bucket: cursor,
      responses: s?.responses ?? 0,
      food: s?.food ?? null,
      service: s?.service ?? null,
      nps: s?.nps ?? null,
    });
    cursor = addDays(cursor, granularity === "week" ? 7 : 1);
  }
  return { granularity, points };
}

export async function getRanking(f: Filters, user: SessionUser) {
  const rows = await db
    .select({ restaurantId: restaurants.id, name: restaurants.name, ...agg })
    .from(responses)
    .innerJoin(restaurants, eq(restaurants.id, responses.restaurantId))
    .leftJoin(answers, eq(answers.responseId, responses.id))
    .leftJoin(questions, eq(questions.id, answers.questionId))
    .where(responseWhere({ ...f, restaurantId: null }, user))
    .groupBy(restaurants.id, restaurants.name);
  return rows
    .map((r) => ({ restaurantId: r.restaurantId, name: r.name, ...toSummary(r) }))
    .sort((a, b) => (b.nps ?? -999) - (a.nps ?? -999) || b.responses - a.responses);
}

// ───────── Resultados por pregunta de una encuesta ─────────

export async function getSurveyQuestionResults(surveyId: string, f: Filters, user: SessionUser) {
  const where = responseWhere({ ...f, restaurantId: null }, user, [eq(responses.surveyId, surveyId)]);
  const [{ total }] = await db.select({ total: count() }).from(responses).where(where);

  const grouped = await db
    .select({
      questionId: answers.questionId,
      valueNumber: answers.valueNumber,
      valueBool: answers.valueBool,
      choice: sql<string | null>`case when ${questions.type} = 'SINGLE_CHOICE' then ${answers.valueText} end`,
      n: count(),
    })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(and(where, sql`${questions.type} <> 'TEXT'`))
    .groupBy(answers.questionId, answers.valueNumber, answers.valueBool, sql`4`);

  const textCounts = await db
    .select({ questionId: answers.questionId, n: count() })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(and(where, eq(questions.type, "TEXT"), sql`coalesce(${answers.valueText}, '') <> ''`))
    .groupBy(answers.questionId);

  const recentText = await db
    .select({
      questionId: answers.questionId,
      text: answers.valueText,
      responseId: responses.id,
      submittedAt: responses.submittedAt,
    })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(and(where, eq(questions.type, "TEXT"), sql`coalesce(${answers.valueText}, '') <> ''`))
    .orderBy(desc(responses.submittedAt))
    .limit(30);

  return { total, grouped, textCounts, recentText };
}

// ───────── Listado de respuestas ─────────

export const PAGE_SIZE = 25;

const metricValue = (metric: string) =>
  sql<
    number | null
  >`(select a.value_number from ${answers} a join ${questions} q on q.id = a.question_id where a.response_id = responses.id and q.metric = ${metric} limit 1)`;

export async function listResponses(f: Filters, user: SessionUser) {
  const where = responseWhere(f, user);
  const [{ total }] = await db.select({ total: count() }).from(responses).where(where);
  const rows = await db
    .select({
      id: responses.id,
      submittedAt: responses.submittedAt,
      channel: responses.channel,
      tableRef: responses.tableRef,
      lowScore: responses.lowScore,
      restaurant: restaurants.name,
      device: devices.name,
      food: metricValue("FOOD"),
      service: metricValue("SERVICE"),
      nps: metricValue("RECOMMEND"),
      comment: sql<
        string | null
      >`(select a.value_text from ${answers} a join ${questions} q on q.id = a.question_id where a.response_id = responses.id and q.type = 'TEXT' and coalesce(a.value_text,'') <> '' order by q.position limit 1)`,
    })
    .from(responses)
    .innerJoin(restaurants, eq(restaurants.id, responses.restaurantId))
    .leftJoin(devices, eq(devices.id, responses.deviceId))
    .where(where)
    .orderBy(desc(responses.submittedAt))
    .limit(PAGE_SIZE)
    .offset((f.page - 1) * PAGE_SIZE);
  return { total, rows };
}

/** Detalle de una respuesta: null si no existe o no es de un restaurante que el usuario pueda ver. */
export async function getResponseDetail(id: string, user: SessionUser) {
  if (!isUuid(id)) return null;
  const r = await db.query.responses.findFirst({
    where: and(eq(responses.id, id), restaurantScope(user, responses.restaurantId)),
    with: {
      restaurant: { columns: { id: true, name: true } },
      device: { columns: { name: true } },
      survey: { columns: { id: true, title: true, version: true } },
      answers: { with: { question: true } },
    },
  });
  if (!r) return null;
  const qs = await db.query.questions.findMany({
    where: eq(questions.surveyId, r.surveyId),
    orderBy: (q, { asc }) => asc(q.position),
  });
  return { ...r, questions: qs };
}

// ───────── Comentarios ─────────

const ACCENTED = "áéíóúüàèìòùäëïöâêîôûñÁÉÍÓÚÜÀÈÌÒÙÄËÏÖÂÊÎÔÛÑ";
const PLAIN = "aeiouuaeiouaeioaeiounAEIOUUAEIOUAEIOAEIOUN";

/** Búsqueda sin distinguir mayúsculas ni acentos ("fria" encuentra "fría"). Sin extensiones de Postgres. */
function textSearch(q: string) {
  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return sql`translate(${answers.valueText}, ${ACCENTED}, ${PLAIN}) ilike translate(${pattern}, ${ACCENTED}, ${PLAIN})`;
}

export async function listComments(f: Filters, user: SessionUser) {
  const where = responseWhere(f, user, [
    eq(questions.type, "TEXT"),
    sql`coalesce(${answers.valueText}, '') <> ''`,
    f.q ? textSearch(f.q) : undefined,
  ]);
  const base = db
    .select({ n: count() })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(where);
  const [{ n: total }] = await base;
  const rows = await db
    .select({
      id: answers.id,
      text: answers.valueText,
      responseId: responses.id,
      submittedAt: responses.submittedAt,
      channel: responses.channel,
      tableRef: responses.tableRef,
      lowScore: responses.lowScore,
      restaurant: restaurants.name,
      food: metricValue("FOOD"),
      service: metricValue("SERVICE"),
      nps: metricValue("RECOMMEND"),
    })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .innerJoin(restaurants, eq(restaurants.id, responses.restaurantId))
    .where(where)
    .orderBy(desc(responses.submittedAt))
    .limit(PAGE_SIZE)
    .offset((f.page - 1) * PAGE_SIZE);
  return { total, rows };
}

/** Fecha (día local) de la primera respuesta de una encuesta, o null si no tiene. */
export async function getFirstResponseAt(surveyId: string, user: SessionUser) {
  const [row] = await db
    .select({ first: sql<Date | null>`min(${responses.submittedAt})` })
    .from(responses)
    .where(and(eq(responses.surveyId, surveyId), restaurantScope(user, responses.restaurantId)));
  return row?.first ? new Date(row.first) : null;
}
