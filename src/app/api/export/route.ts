import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { answers, devices, questions, responses, restaurants, surveys } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { CSV_BOM, csvRow } from "@/lib/csv";
import { APP_TIMEZONE } from "@/lib/dates";
import { parseFilters, responseWhere } from "@/lib/filters";
import { logger } from "@/lib/logger";
import { METRIC_LABELS } from "@/lib/survey-template";

export const dynamic = "force-dynamic";

const MAX_ROWS = 50_000;

function formatLocal(d: Date) {
  // 2026-09-30 15:45 en la zona del negocio (Excel lo reconoce como fecha).
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

/** Exporta las respuestas filtradas: una fila por respuesta, una columna por pregunta. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = await parseFilters(sp, user);
  const where = responseWhere(f, user);

  const rows = await db
    .select({
      id: responses.id,
      submittedAt: responses.submittedAt,
      channel: responses.channel,
      tableRef: responses.tableRef,
      durationSec: responses.durationSec,
      lowScore: responses.lowScore,
      restaurant: restaurants.name,
      device: devices.name,
      survey: surveys.title,
      version: surveys.version,
    })
    .from(responses)
    .innerJoin(restaurants, eq(restaurants.id, responses.restaurantId))
    .innerJoin(surveys, eq(surveys.id, responses.surveyId))
    .leftJoin(devices, eq(devices.id, responses.deviceId))
    .where(where)
    .orderBy(asc(responses.submittedAt))
    .limit(MAX_ROWS);

  // Columnas: por indicador (se unifican entre versiones) o por texto de pregunta.
  const columns = new Map<string, string>();
  const valuesByResponse = new Map<string, Map<string, string>>();
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const ans = await db
      .select({
        responseId: answers.responseId,
        valueNumber: answers.valueNumber,
        valueBool: answers.valueBool,
        valueText: answers.valueText,
        text: questions.text,
        metric: questions.metric,
        position: questions.position,
      })
      .from(answers)
      .innerJoin(questions, eq(questions.id, answers.questionId))
      .where(and(inArray(answers.responseId, chunk)))
      .orderBy(asc(questions.position));
    for (const a of ans) {
      const key = a.metric !== "NONE" ? `m:${a.metric}` : `t:${a.text}`;
      if (!columns.has(key))
        columns.set(key, a.metric !== "NONE" && a.metric !== "COMMENT" ? `${a.text} [${METRIC_LABELS[a.metric]}]` : a.text);
      const v =
        a.valueBool !== null ? (a.valueBool ? "Sí" : "No") : a.valueNumber !== null ? String(a.valueNumber) : (a.valueText ?? "");
      if (!valuesByResponse.has(a.responseId)) valuesByResponse.set(a.responseId, new Map());
      valuesByResponse.get(a.responseId)!.set(key, v);
    }
  }

  const keys = [...columns.keys()];
  const header = [
    "Fecha",
    "Restaurante",
    "Canal",
    "Tablet",
    "Mesa",
    "Encuesta",
    "Versión",
    "Calificación baja",
    "Segundos",
    ...keys.map((k) => columns.get(k)!),
  ];
  const lines = [csvRow(header)];
  for (const r of rows) {
    const vals = valuesByResponse.get(r.id);
    lines.push(
      csvRow([
        formatLocal(r.submittedAt),
        r.restaurant,
        r.channel === "KIOSK" ? "Tablet" : "QR",
        r.device ?? "",
        r.tableRef ?? "",
        r.survey,
        r.version,
        r.lowScore ? "Sí" : "No",
        r.durationSec ?? "",
        ...keys.map((k) => vals?.get(k) ?? ""),
      ]),
    );
  }

  logger.info("export.csv", { userId: user.id, rows: rows.length });
  const filename = `respuestas-${f.from}-a-${f.to}.csv`;
  return new Response(CSV_BOM + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
