import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { canAccessRestaurant } from "@/lib/authz";
import { formatDateTime } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { getResponseDetail } from "@/lib/queries/results";
import { LOW_NPS_MAX, LOW_RATING_MAX } from "@/lib/survey-rules";
import { cn } from "@/lib/cn";

export const metadata = { title: "Respuesta" };

export default async function ResponseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const r = await getResponseDetail(id);
  if (!r || !canAccessRestaurant(user, r.restaurantId)) notFound();
  const byQuestion = new Map(r.answers.map((a) => [a.questionId, a]));

  return (
    <>
      <PageHeader
        title={formatDateTime(r.submittedAt)}
        back={
          <Link href="/admin/responses" className="link">
            Respuestas
          </Link>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {r.lowScore ? <Badge tone="red">Calificación baja</Badge> : null}
            <span>{r.restaurant.name}</span>
          </span>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <ol className="panel divide-y divide-line-soft">
          {r.questions.map((q, i) => {
            const a = byQuestion.get(q.id);
            let value: React.ReactNode = <span className="text-ink-faint">Sin respuesta</span>;
            let low = false;
            if (a) {
              if (a.valueBool !== null) value = a.valueBool ? "Sí" : "No";
              else if (a.valueNumber !== null) {
                if (q.type === "RATING_5") {
                  low = a.valueNumber <= LOW_RATING_MAX;
                  value = (
                    <span aria-label={`${a.valueNumber} de 5`}>
                      <span className="text-mustard">{"★".repeat(a.valueNumber)}</span>
                      <span className="text-line">{"★".repeat(5 - a.valueNumber)}</span>
                      <span className="ml-2 tabular-nums">{a.valueNumber} de 5</span>
                    </span>
                  );
                } else {
                  low = q.type === "NPS_10" && a.valueNumber <= LOW_NPS_MAX;
                  value = <span className="tabular-nums">{a.valueNumber} de 10</span>;
                }
              } else if (a.valueText) value = <span className="whitespace-pre-wrap">{a.valueText}</span>;
            }
            return (
              <li key={q.id} className="grid gap-1 px-5 py-4 sm:grid-cols-[1fr_1fr] sm:gap-6">
                <p className="text-ink-soft">
                  <span className="mr-2 tabular-nums text-ink-faint">{i + 1}.</span>
                  {q.text}
                </p>
                <p className={cn("font-medium", low ? "text-chile" : "")}>{value}</p>
              </li>
            );
          })}
        </ol>
        <aside className="panel h-fit space-y-4 p-5 text-sm">
          <Detail label="Origen">
            {r.channel === "KIOSK" ? `Tablet${r.device ? `: ${r.device.name}` : ""}` : "QR"}
            {r.tableRef ? `, mesa ${r.tableRef}` : ""}
          </Detail>
          <Detail label="Encuesta">
            <Link href={`/admin/surveys/${r.survey.id}`} className="link">
              {r.survey.title} (v{r.survey.version})
            </Link>
          </Detail>
          <Detail label="Tiempo para responder">{r.durationSec !== null ? `${r.durationSec} s` : "—"}</Detail>
          <Detail label="Recibida">{formatDateTime(r.receivedAt)}</Detail>
        </aside>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-ink-soft">{label}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
