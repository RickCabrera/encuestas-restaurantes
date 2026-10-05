/** Cálculos puros de indicadores. Sin dependencias de BD para poder probarlos. */

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function percentTrue(values: boolean[]): number | null {
  if (values.length === 0) return null;
  return (values.filter(Boolean).length / values.length) * 100;
}

export type NpsBreakdown = {
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** De -100 a 100, o null sin datos. */
  score: number | null;
};

/** NPS estándar: promotores 9–10, pasivos 7–8, detractores 0–6. */
export function nps(values: number[]): NpsBreakdown {
  const total = values.length;
  const promoters = values.filter((v) => v >= 9).length;
  const detractors = values.filter((v) => v <= 6).length;
  const passives = total - promoters - detractors;
  return {
    total,
    promoters,
    passives,
    detractors,
    score: total === 0 ? null : Math.round(((promoters - detractors) / total) * 100),
  };
}

/** Distribución de conteos para valores enteros en [min, max]. */
export function distribution(values: number[], min: number, max: number) {
  const counts = new Map<number, number>();
  for (let i = min; i <= max; i++) counts.set(i, 0);
  for (const v of values) if (counts.has(v)) counts.set(v, counts.get(v)! + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, count }));
}

export function formatAvg(v: number | null, digits = 1) {
  return v === null ? "—" : v.toFixed(digits);
}

export function formatPct(v: number | null) {
  return v === null ? "—" : `${Math.round(v)}%`;
}

export function formatNps(v: number | null) {
  if (v === null) return "—";
  return v > 0 ? `+${v}` : `${v}`;
}

/** Agrupa por día o semana según la longitud del rango. */
export function bucketKey(date: Date, granularity: "day" | "week", timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  if (granularity === "day") {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // Semana que inicia en lunes.
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - dow);
  return utc.toISOString().slice(0, 10);
}

/** "1 respuesta", "3 respuestas" (con separador de miles). */
export function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("es-MX")} ${n === 1 ? one : many}`;
}
