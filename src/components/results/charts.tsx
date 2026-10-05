"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const C = {
  basil: "#2f6b4f",
  mustard: "#e3a21a",
  chile: "#b8412b",
  bars: "#c9d1cb",
  grid: "#e8ece8",
  ink: "#56625b",
};

function shortDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export type TrendDatum = { bucket: string; responses: number; food: number | null; service: number | null };

export function TrendChart({ data, granularity }: { data: TrendDatum[]; granularity: "day" | "week" }) {
  const rows = data.map((d) => ({
    ...d,
    label: granularity === "week" ? `Sem. ${shortDay(d.bucket)}` : shortDay(d.bucket),
    food: d.food === null ? null : Number(d.food.toFixed(2)),
    service: d.service === null ? null : Number(d.service.toFixed(2)),
  }));
  return (
    <div className="h-[300px] w-full" role="img" aria-label="Respuestas y calificaciones promedio en el tiempo">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: C.ink, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: C.bars }}
            minTickGap={16}
          />
          <YAxis yAxisId="n" allowDecimals={false} tick={{ fill: C.ink, fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis
            yAxisId="r"
            orientation="right"
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={{ fill: C.ink, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: `1px solid ${C.bars}`, fontSize: 13 }}
            formatter={(v, name) => [v ?? "—", name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
            iconType="circle"
            formatter={(v) => <span style={{ color: C.ink }}>{v}</span>}
          />
          <Bar yAxisId="n" dataKey="responses" name="Respuestas" fill={C.bars} radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Line yAxisId="r" type="linear" dataKey="food" name="Alimentos" stroke={C.basil} strokeWidth={2} dot={{ r: 2.5 }} />
          <Line yAxisId="r" type="linear" dataKey="service" name="Atención" stroke={C.mustard} strokeWidth={2} dot={{ r: 2.5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontales de distribución (estrellas, NPS, opciones). */
export function DistributionChart({
  data,
  height,
}: {
  /** `color` es opcional; se pasa ya resuelto porque las funciones no cruzan de servidor a cliente. */
  data: { label: string; count: number; color?: string }[];
  height?: number;
}) {
  const total = data.reduce((a, b) => a + b.count, 0) || 1;
  return (
    <ul className="space-y-1.5" style={height ? { minHeight: height } : undefined}>
      {data.map((d) => {
        const pct = (d.count / total) * 100;
        return (
          <li key={d.label} className="grid grid-cols-[88px_1fr_72px] items-center gap-3 text-sm">
            <span className="truncate text-ink-soft">{d.label}</span>
            <span className="h-5 overflow-hidden rounded bg-line-soft">
              <span className="block h-full rounded" style={{ width: `${pct}%`, background: d.color ?? C.basil }} />
            </span>
            <span className="text-right tabular-nums">
              {d.count} <span className="text-ink-faint">({Math.round(pct)}%)</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function NpsColumns({ data }: { data: { value: number; count: number }[] }) {
  return (
    <div className="h-[180px] w-full" role="img" aria-label="Distribución de recomendación de 0 a 10">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="value" tick={{ fill: C.ink, fontSize: 12 }} tickLine={false} axisLine={{ stroke: C.bars }} />
          <YAxis allowDecimals={false} tick={{ fill: C.ink, fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: 8, fontSize: 13 }}
            formatter={(v) => [v, "Respuestas"]}
            labelFormatter={(l) => `Calificación ${l}`}
          />
          <Bar
            dataKey="count"
            radius={[3, 3, 0, 0]}
            shape={(props: unknown) => {
              const p = props as { x: number; y: number; width: number; height: number; payload: { value: number } };
              const v = p.payload.value;
              const fill = v <= 6 ? C.chile : v <= 8 ? C.mustard : C.basil;
              return <rect x={p.x} y={p.y} width={p.width} height={Math.max(0, p.height)} rx={3} fill={fill} />;
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
