import Link from "next/link";
import { FilterBar, Pagination } from "@/components/results/filter-bar";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { listResponses, PAGE_SIZE } from "@/lib/queries/results";
import { cn } from "@/lib/cn";

export const metadata = { title: "Respuestas" };

function Stars({ n }: { n: number | null }) {
  if (n === null) return <span className="text-ink-faint">—</span>;
  return (
    <span className={cn("tabular-nums", n <= 2 ? "font-medium text-chile" : "")} aria-label={`${n} de 5`}>
      {n} <span className="text-mustard">★</span>
    </span>
  );
}

export default async function ResponsesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const f = await parseFilters(await searchParams, user);
  const { total, rows } = await listResponses(f, user);

  return (
    <>
      <PageHeader title="Respuestas" description="Cada encuesta enviada, de la más reciente a la más antigua." />
      <FilterBar f={f} path="/admin/responses" show={{ table: true, low: true }} exportHref={`/api/export${filtersToQuery(f)}`} />
      {rows.length === 0 ? (
        <EmptyState title="Sin respuestas con estos filtros">Amplía el rango de fechas o quita algún filtro.</EmptyState>
      ) : (
        <>
          {/* Celular: tarjetas (la tabla obliga a deslizar de lado). */}
          <ul className="panel divide-y divide-line-soft sm:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/responses/${r.id}`} className="block px-4 py-3 active:bg-paper/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{formatDateTime(r.submittedAt)}</span>
                    {r.lowScore ? <Badge tone="red">Baja</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-soft">
                    {r.restaurant} · {r.channel === "KIOSK" ? (r.device ?? "Tablet") : "QR"}
                    {r.tableRef ? `, mesa ${r.tableRef}` : ""}
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                    <span>
                      Alimentos <Stars n={r.food} />
                    </span>
                    <span>
                      Atención <Stars n={r.service} />
                    </span>
                    <span>
                      Recomienda{" "}
                      <span className={cn("tabular-nums", r.nps !== null && r.nps <= 6 ? "font-medium text-chile" : "")}>
                        {r.nps ?? "—"}
                      </span>
                    </span>
                  </p>
                  {r.comment ? <p className="mt-1.5 line-clamp-2 text-[14px] text-ink-soft">{r.comment}</p> : null}
                </Link>
              </li>
            ))}
          </ul>
          <div className="panel hidden overflow-x-auto sm:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Restaurante</th>
                  <th>Origen</th>
                  <th className="text-right">Alimentos</th>
                  <th className="text-right">Atención</th>
                  <th className="text-right">Recomienda</th>
                  <th>Comentario</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-paper/60">
                    <td className="whitespace-nowrap">
                      <Link href={`/admin/responses/${r.id}`} className="font-medium hover:text-basil hover:underline">
                        {formatDateTime(r.submittedAt)}
                      </Link>
                      {r.lowScore ? (
                        <Badge tone="red" className="ml-2">
                          Baja
                        </Badge>
                      ) : null}
                    </td>
                    <td className="min-w-[160px]">{r.restaurant}</td>
                    <td className="whitespace-nowrap text-ink-soft">
                      {r.channel === "KIOSK" ? (r.device ?? "Tablet") : "QR"}
                      {r.tableRef ? `, mesa ${r.tableRef}` : ""}
                    </td>
                    <td className="text-right">
                      <Stars n={r.food} />
                    </td>
                    <td className="text-right">
                      <Stars n={r.service} />
                    </td>
                    <td className={cn("text-right tabular-nums", r.nps !== null && r.nps <= 6 ? "font-medium text-chile" : "")}>
                      {r.nps ?? <span className="text-ink-faint">—</span>}
                    </td>
                    <td className="max-w-[260px] min-w-[180px] truncate text-ink-soft" title={r.comment ?? undefined}>
                      {r.comment ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={total} f={f} path="/admin/responses" pageSize={PAGE_SIZE} />
        </>
      )}
    </>
  );
}
