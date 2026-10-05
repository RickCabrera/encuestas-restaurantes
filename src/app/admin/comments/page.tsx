import Link from "next/link";
import { FilterBar, Pagination } from "@/components/results/filter-bar";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { parseFilters } from "@/lib/filters";
import { listComments, PAGE_SIZE } from "@/lib/queries/results";
import { cn } from "@/lib/cn";

export const metadata = { title: "Comentarios" };

export default async function CommentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const f = await parseFilters(await searchParams, user);
  const { total, rows } = await listComments(f, user);

  return (
    <>
      <PageHeader
        title="Comentarios"
        description="Quejas, sugerencias y felicitaciones. Los marcados en rojo vienen de una calificación baja (2 estrellas o menos, o recomendación de 6 o menos)."
      />
      <FilterBar f={f} path="/admin/comments" show={{ low: true, search: true }} />
      {rows.length === 0 ? (
        <EmptyState title="Sin comentarios con estos filtros">Amplía el rango de fechas o cambia la búsqueda.</EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((c) => (
              <li key={c.id} className={cn("panel px-5 py-4", c.lowScore ? "border-l-4 border-l-chile" : "")}>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{c.text}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
                  <span>{c.restaurant}</span>
                  <span>{formatDateTime(c.submittedAt)}</span>
                  <span>{c.channel === "KIOSK" ? "Tablet" : c.tableRef ? `QR, mesa ${c.tableRef}` : "QR"}</span>
                  {c.food !== null ? <span>Alimentos {c.food}★</span> : null}
                  {c.service !== null ? <span>Atención {c.service}★</span> : null}
                  {c.nps !== null ? <span>Recomienda {c.nps}/10</span> : null}
                  <Link href={`/admin/responses/${c.responseId}`} className="link ml-auto">
                    Ver respuesta completa
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <Pagination total={total} f={f} path="/admin/comments" pageSize={PAGE_SIZE} />
        </>
      )}
    </>
  );
}
