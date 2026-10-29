import { cn } from "@/lib/cn";

/** Marca de Sobremesa: un globo de conversación con una estrella, sobre el color de acento. */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] shadow-sm",
        className,
      )}
      style={{
        width: size,
        height: size,
        background:
          "linear-gradient(140deg, color-mix(in oklab, var(--color-basil) 78%, white) 0%, var(--color-basil-dark) 100%)",
      }}
    >
      <svg viewBox="0 0 32 32" width={size * 0.72} height={size * 0.72} fill="none">
        <path
          d="M6 8.5A4.5 4.5 0 0 1 10.5 4h11A4.5 4.5 0 0 1 26 8.5v8a4.5 4.5 0 0 1-4.5 4.5H14l-5.2 4.3c-.7.6-1.8.1-1.8-.8V21A4.5 4.5 0 0 1 6 16.5v-8Z"
          fill="white"
          fillOpacity=".96"
        />
        <path d="m16 7.6 1.55 3.14 3.47.5-2.51 2.45.6 3.45L16 15.5l-3.1 1.64.59-3.45-2.5-2.45 3.46-.5L16 7.6Z" fill="#e8a317" />
      </svg>
    </span>
  );
}

export function Logo({
  className,
  size = 36,
  tone = "dark",
  subtitle,
}: {
  className?: string;
  size?: number;
  /** "light" para fondos oscuros. */
  tone?: "dark" | "light";
  subtitle?: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark size={size} />
      <span className="min-w-0 leading-none">
        <span
          className={cn("block font-display font-bold tracking-[-0.02em]", tone === "light" ? "text-white" : "text-ink")}
          style={{ fontSize: size * 0.62 }}
        >
          Sobremesa
        </span>
        {subtitle ? (
          <span
            className={cn("mt-1.5 block truncate text-[13px] font-normal", tone === "light" ? "text-white/60" : "text-ink-soft")}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
