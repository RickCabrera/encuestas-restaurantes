import { formatAvg, formatNps, formatPct, plural } from "@/lib/metrics";
import type { MetricSummary } from "@/lib/queries/results";
import { cn } from "@/lib/cn";

type Kpi = {
  label: string;
  value: string;
  unit?: string;
  delta?: { text: string; good: boolean } | null;
  note?: string;
};

function delta(cur: number | null, prev: number | null, digits: number, suffix = "", higherIsBetter = true) {
  if (cur === null || prev === null) return null;
  const d = cur - prev;
  if (Math.abs(d) < Math.pow(10, -digits) / 2) return { text: "Sin cambio", good: true };
  const sign = d > 0 ? "+" : "−";
  return { text: `${sign}${Math.abs(d).toFixed(digits)}${suffix} vs. periodo anterior`, good: higherIsBetter ? d > 0 : d < 0 };
}

/** Franja de indicadores: un solo bloque dividido por líneas finas. */
export function KpiStrip({ cur, prev }: { cur: MetricSummary; prev: MetricSummary }) {
  const items: Kpi[] = [
    {
      label: "Respuestas",
      value: cur.responses.toLocaleString("es-MX"),
      delta: prev.responses || cur.responses ? delta(cur.responses, prev.responses, 0) : null,
    },
    {
      label: "Alimentos",
      value: formatAvg(cur.food),
      unit: cur.food !== null ? "/ 5" : undefined,
      delta: delta(cur.food, prev.food, 1),
    },
    {
      label: "Atención del mesero",
      value: formatAvg(cur.service),
      unit: cur.service !== null ? "/ 5" : undefined,
      delta: delta(cur.service, prev.service, 1),
    },
    {
      label: "NPS",
      value: formatNps(cur.nps),
      delta: delta(cur.nps, prev.nps, 0, " pts"),
      note: cur.npsCount
        ? `${plural(cur.promoters, "promotor", "promotores")}, ${plural(cur.detractors, "detractor", "detractores")}`
        : undefined,
    },
    {
      label: "Visita del jefe de mesas",
      value: formatPct(cur.captainVisitPct),
      delta: delta(cur.captainVisitPct, prev.captainVisitPct, 0, " pts"),
    },
    { label: "Primera visita", value: formatPct(cur.firstVisitPct), note: "De quienes respondieron" },
  ];

  return (
    <section
      aria-label="Indicadores"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-line bg-line-soft sm:grid-cols-3 xl:grid-cols-6"
    >
      {items.map((k) => (
        <div key={k.label} className="bg-surface px-5 py-5">
          <p className="text-[13px] text-ink-soft">{k.label}</p>
          <p className="mt-1 font-display text-[32px] leading-none font-semibold tabular-nums">
            {k.value}
            {k.unit ? <span className="ml-1 text-base font-normal text-ink-faint">{k.unit}</span> : null}
          </p>
          {k.delta ? (
            <p
              className={cn(
                "mt-2 text-[12px]",
                k.delta.text === "Sin cambio" ? "text-ink-faint" : k.delta.good ? "text-basil" : "text-chile",
              )}
            >
              {k.delta.text}
            </p>
          ) : k.note ? (
            <p className="mt-2 text-[12px] text-ink-faint">{k.note}</p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
