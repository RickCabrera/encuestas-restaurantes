import Link from "next/link";
import { notFound } from "next/navigation";
import { DistributionChart, NpsColumns } from "@/components/results/charts";
import { FilterBar } from "@/components/results/filter-bar";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { dayInTz, formatDateTime } from "@/lib/dates";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { average, formatAvg, formatNps, nps, plural } from "@/lib/metrics";
import { getFirstResponseAt, getSurveyQuestionResults } from "@/lib/queries/results";
import { getAccessibleSurvey } from "@/lib/queries/surveys";
import { QUESTION_TYPE_LABELS } from "@/lib/survey-template";

export const metadata = { title: "Resultados por pregunta" };

export default async function SurveyResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const survey = await getAccessibleSurvey(user, id);
  if (!survey) notFound();
  // Por defecto, todo el historial de la encuesta (desde su primera respuesta).
  const sp = await searchParams;
  const first = await getFirstResponseAt(id, user);
  const defaultFrom = dayInTz(first ?? survey.publishedAt ?? survey.createdAt);
  const given = Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== ""));
  const f = await parseFilters({ from: defaultFrom, ...given, restaurant: "all", survey: id }, user);
  const res = await getSurveyQuestionResults(id, f, user);
  const path = `/admin/surveys/${id}/results`;

  return (
    <>
      <PageHeader
        title="Resultados por pregunta"
        back={
          <Link href={`/admin/surveys/${id}`} className="link">
            {survey.title}
          </Link>
        }
        description={`${survey.restaurant.name}, versión ${survey.version}. ${plural(res.total, "respuesta", "respuestas")} en el periodo.`}
      />
      <FilterBar
        f={{ ...f, restaurantId: null }}
        path={path}
        show={{ table: true }}
        exportHref={`/api/export${filtersToQuery({ ...f, restaurantId: null })}`}
      />
      {res.total === 0 ? (
        <EmptyState title="Sin respuestas en este periodo" />
      ) : (
        <ol className="space-y-5">
          {survey.questions.map((q, i) => {
            const rows = res.grouped.filter((g) => g.questionId === q.id);
            const answered = rows.reduce((a, b) => a + b.n, 0);
            return (
              <li key={q.id} className="panel p-5">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold">
                    <span className="mr-2 text-ink-faint tabular-nums">{i + 1}.</span>
                    {q.text}
                  </h2>
                  <p className="text-[13px] text-ink-soft">
                    {QUESTION_TYPE_LABELS[q.type]}
                    {q.type !== "TEXT" ? `, ${plural(answered, "respuesta", "respuestas")}` : ""}
                  </p>
                </div>
                <QuestionResult q={q} rows={rows} res={res} surveyId={id} />
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

type Grouped = Awaited<ReturnType<typeof getSurveyQuestionResults>>;

function QuestionResult({
  q,
  rows,
  res,
  surveyId,
}: {
  q: { id: string; type: string; options: { choices?: string[] } | null };
  rows: Grouped["grouped"];
  res: Grouped;
  surveyId: string;
}) {
  if (q.type === "YES_NO") {
    const yes = rows.find((r) => r.valueBool === true)?.n ?? 0;
    const no = rows.find((r) => r.valueBool === false)?.n ?? 0;
    return (
      <DistributionChart
        data={[
          { label: "Sí", count: yes, color: "#2f6b4f" },
          { label: "No", count: no, color: "#8a958e" },
        ]}
      />
    );
  }
  if (q.type === "RATING_5") {
    const values = rows.flatMap((r) => Array(r.n).fill(r.valueNumber) as number[]);
    return (
      <div className="grid gap-6 sm:grid-cols-[140px_1fr]">
        <div>
          <p className="font-display text-4xl font-semibold tabular-nums">{formatAvg(average(values))}</p>
          <p className="text-[13px] text-ink-soft">promedio de 5</p>
        </div>
        <DistributionChart
          data={[5, 4, 3, 2, 1].map((v) => ({
            label: `${v} ★`,
            count: rows.find((r) => r.valueNumber === v)?.n ?? 0,
            color: v <= 2 ? "#b8412b" : "#e3a21a",
          }))}
        />
      </div>
    );
  }
  if (q.type === "NPS_10") {
    const values = rows.flatMap((r) => Array(r.n).fill(r.valueNumber) as number[]);
    const b = nps(values);
    const data = Array.from({ length: 11 }, (_, v) => ({ value: v, count: rows.find((r) => r.valueNumber === v)?.n ?? 0 }));
    return (
      <div className="grid gap-6 sm:grid-cols-[140px_1fr]">
        <div>
          <p className="font-display text-4xl font-semibold tabular-nums">{formatNps(b.score)}</p>
          <p className="text-[13px] text-ink-soft">NPS</p>
          <p className="mt-3 text-[13px] leading-5 text-ink-soft">
            {plural(b.promoters, "promotor", "promotores")}
            <br />
            {plural(b.passives, "pasivo", "pasivos")}
            <br />
            {plural(b.detractors, "detractor", "detractores")}
          </p>
        </div>
        <NpsColumns data={data} />
      </div>
    );
  }
  if (q.type === "SINGLE_CHOICE") {
    return (
      <DistributionChart
        data={(q.options?.choices ?? []).map((c) => ({ label: c, count: rows.find((r) => r.choice === c)?.n ?? 0 }))}
      />
    );
  }
  // TEXT
  const count = res.textCounts.find((t) => t.questionId === q.id)?.n ?? 0;
  const recent = res.recentText.filter((t) => t.questionId === q.id).slice(0, 8);
  return (
    <div>
      <p className="mb-3 text-sm text-ink-soft">
        {count === 1 ? "1 persona escribió algo." : `${count.toLocaleString("es-MX")} personas escribieron algo.`}
      </p>
      <ul className="divide-y divide-line-soft">
        {recent.map((t) => (
          <li key={t.responseId} className="py-2.5">
            <Link href={`/admin/responses/${t.responseId}`} className="hover:text-basil">
              {t.text}
            </Link>
            <span className="ml-2 text-[12px] text-ink-faint">{formatDateTime(t.submittedAt)}</span>
          </li>
        ))}
      </ul>
      {count > recent.length ? (
        <Link href={`/admin/comments?restaurant=all&survey=${surveyId}`} className="link mt-3 inline-block text-sm">
          Ver todos los comentarios
        </Link>
      ) : null}
    </div>
  );
}
