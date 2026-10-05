import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { addDays, dayInTz } from "@/lib/dates";
import { type Filters, filtersToQuery } from "@/lib/filters";
import { cn } from "@/lib/cn";

/** Barra de filtros por URL (funciona sin JavaScript). */
export function FilterBar({
  f,
  path,
  show = {},
  exportHref,
}: {
  f: Filters;
  path: string;
  show?: { table?: boolean; low?: boolean; search?: boolean };
  exportHref?: string;
}) {
  const today = dayInTz(new Date());
  const presets = [
    { label: "Hoy", from: today, to: today },
    { label: "7 días", from: addDays(today, -6), to: today },
    { label: "30 días", from: addDays(today, -29), to: today },
    { label: "90 días", from: addDays(today, -89), to: today },
  ];

  return (
    <div className="mb-8 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Periodo">
        {presets.map((p) => {
          const active = f.from === p.from && f.to === p.to;
          return (
            <Link
              key={p.label}
              href={`${path}${filtersToQuery(f, { from: p.from, to: p.to, page: null })}`}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px] transition-colors",
                active ? "border-basil bg-basil text-white" : "border-line bg-surface text-ink-soft hover:text-ink",
              )}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
      <form
        method="get"
        action={path}
        // La clave cambia con los filtros: así los campos muestran el periodo vigente
        // después de usar Hoy/7/30/90 días (los inputs no controlados no se reinician solos).
        key={`${f.from}|${f.to}|${f.channel ?? ""}|${f.table ?? ""}|${f.q ?? ""}|${f.lowOnly}`}
        className="flex flex-wrap items-end gap-3"
      >
        {f.restaurantId ? <input type="hidden" name="restaurant" value={f.restaurantId} /> : null}
        {f.surveyId ? <input type="hidden" name="survey" value={f.surveyId} /> : null}
        <label className="text-[13px] text-ink-soft">
          Desde
          <input type="date" name="from" defaultValue={f.from} max={today} className="input mt-1 h-9 py-1" />
        </label>
        <label className="text-[13px] text-ink-soft">
          Hasta
          <input type="date" name="to" defaultValue={f.to} max={today} className="input mt-1 h-9 py-1" />
        </label>
        <label className="text-[13px] text-ink-soft">
          Canal
          <select name="channel" defaultValue={f.channel ?? ""} className="input mt-1 h-9 py-1">
            <option value="">Tablet y QR</option>
            <option value="KIOSK">Solo tablet</option>
            <option value="QR">Solo QR</option>
          </select>
        </label>
        {show.table ? (
          <label className="text-[13px] text-ink-soft">
            Mesa
            <input
              name="table"
              aria-label="Mesa"
              defaultValue={f.table ?? ""}
              className="input mt-1 h-9 w-20 py-1"
              maxLength={20}
            />
          </label>
        ) : null}
        {show.search ? (
          <label className="text-[13px] text-ink-soft">
            Buscar texto
            <input
              type="search"
              name="q"
              defaultValue={f.q ?? ""}
              className="input mt-1 h-9 w-48 py-1"
              placeholder="p. ej. frío"
            />
          </label>
        ) : null}
        {show.low ? (
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" name="low" value="1" aria-label="Solo calificaciones bajas" defaultChecked={f.lowOnly} /> Solo
            calificaciones bajas
          </label>
        ) : null}
        <button type="submit" className={buttonClass("secondary", "sm", "h-9")}>
          Aplicar
        </button>
        {exportHref ? (
          <a href={exportHref} className={buttonClass("ghost", "sm", "ml-auto h-9")}>
            Exportar CSV
          </a>
        ) : null}
      </form>
    </div>
  );
}

export function Pagination({ total, f, path, pageSize }: { total: number; f: Filters; path: string; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => `${path}${filtersToQuery(f, { page: String(p) })}`;
  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Paginación">
      <span className="text-ink-soft">
        Página {f.page} de {pages} ({total.toLocaleString("es-MX")} en total)
      </span>
      <div className="flex gap-2">
        {f.page > 1 ? (
          <Link href={href(f.page - 1)} className={buttonClass("secondary", "sm")}>
            Anterior
          </Link>
        ) : null}
        {f.page < pages ? (
          <Link href={href(f.page + 1)} className={buttonClass("secondary", "sm")}>
            Siguiente
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
