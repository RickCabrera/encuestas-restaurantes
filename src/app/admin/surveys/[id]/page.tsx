import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { responses, surveys } from "@/db/schema";
import { ButtonLink } from "@/components/ui/button";
import { Notice, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/survey/status-badge";
import { requireUser } from "@/lib/auth";
import { canAccessRestaurant } from "@/lib/authz";
import { formatDateTime } from "@/lib/dates";
import { plural } from "@/lib/metrics";
import { isUuid } from "@/lib/ids";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import { canDeleteSurvey, canEditSurvey } from "@/lib/survey-rules";
import { METRIC_LABELS, QUESTION_TYPE_LABELS } from "@/lib/survey-template";
import { SurveyActions } from "./survey-actions";
import { SurveyEditor } from "./survey-editor";

export const metadata = { title: "Encuesta" };

export default async function SurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const survey = await db.query.surveys.findFirst({
    where: eq(surveys.id, id),
    with: {
      questions: { orderBy: (q, { asc }) => asc(q.position) },
      restaurant: { columns: { id: true, name: true } },
    },
  });
  if (!survey || !canAccessRestaurant(user, survey.restaurantId)) notFound();
  const [{ n: responseCount }] = await db.select({ n: count() }).from(responses).where(eq(responses.surveyId, id));
  const isAdmin = user.role === "ADMIN";
  const editable = isAdmin && canEditSurvey(responseCount);
  const restaurants = isAdmin ? await listAccessibleRestaurants(user) : [];

  return (
    <>
      <PageHeader
        title={survey.title}
        back={
          <Link href="/admin/surveys" className="link">
            Encuestas
          </Link>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={survey.status} />
            <span>
              {survey.restaurant.name}, versión {survey.version}
            </span>
            {survey.publishedAt ? (
              <span className="text-ink-faint">Publicada por primera vez el {formatDateTime(survey.publishedAt)}</span>
            ) : null}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/admin/surveys/${id}/preview`} variant="secondary">
              Vista previa
            </ButtonLink>
            {responseCount > 0 ? (
              <ButtonLink href={`/admin/surveys/${id}/results`} variant="secondary">
                Resultados ({responseCount.toLocaleString("es-MX")})
              </ButtonLink>
            ) : null}
            {isAdmin ? (
              <SurveyActions
                surveyId={id}
                status={survey.status}
                restaurantId={survey.restaurantId}
                restaurants={restaurants}
                canDelete={canDeleteSurvey(survey.status, responseCount)}
              />
            ) : null}
          </>
        }
      />

      {isAdmin && !editable ? (
        <div className="mb-6">
          <Notice tone="amber">
            Esta encuesta ya tiene {plural(responseCount, "respuesta", "respuestas")}, así que no se puede editar para no alterar
            los resultados. Para cambiarla, usa <strong>Duplicar</strong> y publica la nueva versión.
          </Notice>
        </div>
      ) : null}

      {editable ? (
        <SurveyEditor
          surveyId={id}
          initial={{
            title: survey.title,
            welcomeText: survey.welcomeText,
            closingText: survey.closingText,
            questions: survey.questions.map((q) => ({
              type: q.type,
              text: q.text,
              required: q.required,
              metric: q.metric,
              choices: q.options?.choices,
            })),
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <ol className="panel divide-y divide-line-soft">
            {survey.questions.map((q, i) => (
              <li key={q.id} className="flex gap-4 px-5 py-4">
                <span className="mt-0.5 font-display text-lg font-semibold text-ink-faint tabular-nums">{i + 1}</span>
                <div>
                  <p className="font-medium">{q.text}</p>
                  <p className="mt-1 text-[13px] text-ink-soft">
                    {QUESTION_TYPE_LABELS[q.type]}
                    {q.required ? ", obligatoria" : ", opcional"}
                    {q.metric !== "NONE" ? `. Indicador: ${METRIC_LABELS[q.metric]}` : ""}
                  </p>
                  {q.options?.choices?.length ? (
                    <p className="mt-1 text-[13px] text-ink-soft">Opciones: {q.options.choices.join(", ")}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <aside className="panel h-fit space-y-4 p-5 text-sm">
            <div>
              <p className="text-ink-soft">Bienvenida</p>
              <p className="mt-1">{survey.welcomeText || "—"}</p>
            </div>
            <div>
              <p className="text-ink-soft">Mensaje final</p>
              <p className="mt-1">{survey.closingText}</p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
