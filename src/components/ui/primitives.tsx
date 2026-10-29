import { cn } from "@/lib/cn";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | string[];
  children: React.ReactNode;
  className?: string;
}) {
  const err = Array.isArray(error) ? error[0] : error;
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {err ? (
        <p className="field-error" id={`${htmlFor}-error`}>
          {err}
        </p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      {back ? <div className="mb-3 text-sm">{back}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold tracking-[-0.02em]">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-ink-soft">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-start gap-3 px-6 py-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="max-w-xl text-ink-soft">{children}</div> : null}
      {action}
    </div>
  );
}

type Tone = "neutral" | "green" | "amber" | "red";

const tones: Record<Tone, string> = {
  neutral: "bg-line-soft text-ink-soft",
  green: "bg-basil-tint text-basil-ink",
  amber: "bg-mustard-tint text-mustard-ink",
  red: "bg-chile-tint text-chile",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  const border: Record<Tone, string> = {
    neutral: "border-line bg-surface",
    green: "border-basil/30 bg-basil-tint",
    amber: "border-mustard/40 bg-mustard-tint",
    red: "border-chile/30 bg-chile-tint",
  };
  return (
    <div role="status" className={cn("rounded-[var(--radius-sm)] border px-4 py-3 text-sm", border[tone])}>
      {children}
    </div>
  );
}

/** Bloque con título y acciones a la derecha (fichas de la Administración). */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-10 first:mt-0", className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-sm text-ink-soft">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Indicador grande con etiqueta. */
export function Stat({
  value,
  label,
  tone,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  tone?: "red" | "green" | "amber";
}) {
  return (
    <div className="panel px-5 py-4">
      <p
        className={cn(
          "font-display text-[28px] leading-tight font-bold",
          tone === "red" && "text-chile",
          tone === "green" && "text-basil-ink",
          tone === "amber" && "text-mustard-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-sm text-ink-soft">{label}</p>
    </div>
  );
}
