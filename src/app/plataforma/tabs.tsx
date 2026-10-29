import Link from "next/link";
import { cn } from "@/lib/cn";

/** Pestañas por filtro (?param=valor), con conteo. */
export function FilterTabs({
  base,
  param,
  current,
  tabs,
}: {
  base: string;
  param: string;
  current: string;
  tabs: { value: string; label: string; count?: number }[];
}) {
  return (
    <nav aria-label="Filtro" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const active = t.value === current;
        const href = t.value ? `${base}?${param}=${t.value}` : base;
        return (
          <Link
            key={t.value || "all"}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "border-basil text-ink" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="ml-1.5 text-ink-faint">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
