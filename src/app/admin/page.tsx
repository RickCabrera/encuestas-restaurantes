import Link from "next/link";
import { TrendChart } from "@/components/results/charts";
import { FilterBar } from "@/components/results/filter-bar";
import { KpiStrip } from "@/components/results/kpi-strip";
import { EmptyState, Notice, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatDay } from "@/lib/dates";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { formatAvg, formatNps } from "@/lib/metrics";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import { getPreviousSummary, getRanking, getSummary, getTrend, listComments } from "@/lib/queries/results";
import { cn } from "@/lib/cn";

export const metadata = { title: "Resumen" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const f = await parseFilters(sp, user);
  const restaurants = await listAccessibleRestaurants(user);

  if (restaurants.length === 0) {
    return (
      <>
        <PageHeader title="Resumen" />
        <EmptyState
          title={user.role === "ADMIN" ? "Empieza agregando un restaurante" : "Aún no tienes restaurantes asignados"}
          action={
            user.role === "ADMIN" ? (
              <Link href="/admin/restaurants/new" className="link">
                Agregar restaurante
              </Link>
            ) : null
          }
        >
          {user.role === "ADMIN"
            ? "Después crea su encuesta, vincula una tablet o imprime su QR, y aquí verás los resultados."
            : "Pide al administrador que te asigne uno o más restaurantes."}
        </EmptyState>
      </>
    );
  }

  const [cur, prev, trend, ranking, comments] = await Promise.all([
    getSummary(f, user),
    getPreviousSummary(f, user),
    getTrend(f, user),
    getRanking(f, user),
    listComments({ ...f, page: 1 }, user),
  ]);
  const channelLabel = f.channel === "KIOSK" ? ", solo tablet" : f.channel === "QR" ? ", solo QR" : "";
  const scope =
    (f.restaurantId
      ? restaurants.find((r) => r.id === f.restaurantId)?.name
      : restaurants.length === 1
        ? restaurants[0].name
        : "Todos los restaurantes") + channelLabel;

  return (
    <>
      <PageHeader title="Resumen" description={`${scope}, del ${formatDay(f.from)} al ${formatDay(f.to)}.`} />
      {sp.error === "forbidden" ? (
        <div className="mb-6">
          <Notice tone="amber">Esa sección es solo para administradores.</Notice>
        </div>
      ) : null}
      <FilterBar f={f} path="/admin" exportHref={`/api/export${filtersToQuery(f)}`} />

      {cur.responses === 0 ? (
        <EmptyState title="Sin respuestas en este periodo">
          Prueba con un rango de fechas más amplio o revisa que el restaurante tenga una encuesta activa.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          <KpiStrip cur={cur} prev={prev} />

          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Respuestas y calificaciones</h2>
              <p className="text-[13px] text-ink-soft">
                Promedio de 1 a 5 estrellas, por {trend.granularity === "week" ? "semana" : "día"}
              </p>
            </div>
            <TrendChart data={trend.points} granularity={trend.granularity} />
          </section>

          <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
            {!f.restaurantId && ranking.length > 1 ? (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Comparativo por restaurante</h2>
                <div className="panel overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Restaurante</th>
                        <th className="text-right">Respuestas</th>
                        <th className="text-right">Alimentos</th>
                        <th className="text-right">Atención</th>
                        <th className="text-right">NPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r) => (
                        <tr key={r.restaurantId}>
                          <td>
                            <Link
                              href={`/admin${filtersToQuery(f, { restaurant: r.restaurantId })}`}
                              className="font-medium hover:text-basil hover:underline"
                            >
                              {r.name}
                            </Link>
                          </td>
                          <td className="text-right tabular-nums">{r.responses.toLocaleString("es-MX")}</td>
                          <td className="text-right tabular-nums">{formatAvg(r.food)}</td>
                          <td className="text-right tabular-nums">{formatAvg(r.service)}</td>
                          <td className={cn("text-right font-medium tabular-nums", (r.nps ?? 0) < 0 ? "text-chile" : "")}>
                            {formatNps(r.nps)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Recomendación</h2>
                <div className="panel p-5">
                  <NpsBar promoters={cur.promoters} passives={cur.passives} detractors={cur.detractors} />
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Comentarios recientes</h2>
                <Link href={`/admin/comments${filtersToQuery(f)}`} className="link text-sm">
                  Ver todos ({comments.total})
                </Link>
              </div>
              {comments.rows.length === 0 ? (
                <p className="panel p-5 text-ink-soft">Nadie dejó comentarios en este periodo.</p>
              ) : (
                <ul className="panel divide-y divide-line-soft">
                  {comments.rows.slice(0, 5).map((c) => (
                    <li key={c.id} className="px-5 py-4">
                      <Link href={`/admin/responses/${c.responseId}`} className="block hover:text-basil">
                        <p className={cn("line-clamp-3", c.lowScore ? "border-l-2 border-chile pl-3" : "")}>{c.text}</p>
                        <p className="mt-1.5 text-[12px] text-ink-faint">
                          {c.restaurant}, {formatDateTime(c.submittedAt)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function NpsBar({ promoters, passives, detractors }: { promoters: number; passives: number; detractors: number }) {
  const total = promoters + passives + detractors || 1;
  const seg = [
    { label: "Detractores (0–6)", n: detractors, cls: "bg-chile" },
    { label: "Pasivos (7–8)", n: passives, cls: "bg-mustard" },
    { label: "Promotores (9–10)", n: promoters, cls: "bg-basil" },
  ];
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-line-soft">
        {seg.map((s) => (
          <div key={s.label} className={s.cls} style={{ width: `${(s.n / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {seg.map((s) => (
          <li key={s.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${s.cls}`} />
              {s.label}
            </span>
            <span className="tabular-nums">
              {s.n} <span className="text-ink-faint">({Math.round((s.n / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
