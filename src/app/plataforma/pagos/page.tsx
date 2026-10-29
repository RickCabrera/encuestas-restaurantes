import Link from "next/link";
import { Badge, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import {
  BILLING_STATUS_LABEL,
  formatMoney,
  formatPeriod,
  isValidPeriod,
  periodOf,
  shiftPeriod,
  type BillingStatus,
} from "@/lib/billing";
import { billingOverview } from "@/lib/queries/platform";
import { FilterTabs } from "../tabs";

export const metadata = { title: "Pagos" };

const TONE: Record<BillingStatus, "green" | "amber" | "red"> = { PAID: "green", PENDING: "amber", OVERDUE: "red" };
const FILTERS: Record<string, BillingStatus> = { pagados: "PAID", pendientes: "PENDING", vencidos: "OVERDUE" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; estado?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const current = periodOf(new Date());
  const period = isValidPeriod(sp.mes) && sp.mes <= current ? sp.mes : current;
  const { rows, totals } = await billingOverview(period);
  const q = (sp.q ?? "").trim().toLowerCase();
  const filter = sp.estado && FILTERS[sp.estado];
  const shown = rows.filter((r) => (!filter || r.status === filter) && (!q || r.name.toLowerCase().includes(q)));
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(period !== current ? { mes: period } : {}), ...extra });
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <PageHeader
        title="Pagos"
        description={`Las mensualidades de ${formatPeriod(period)}. Los pagos se capturan a mano; nada corta el servicio automáticamente.`}
        actions={
          <div className="flex items-center gap-1 text-sm">
            <Link className="rounded-lg px-3 py-2 hover:bg-line-soft" href={`/plataforma/pagos?mes=${shiftPeriod(period, -1)}`}>
              ‹ Mes anterior
            </Link>
            {period < current ? (
              <Link className="rounded-lg px-3 py-2 hover:bg-line-soft" href={`/plataforma/pagos?mes=${shiftPeriod(period, 1)}`}>
                Mes siguiente ›
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={totals.paid} label="Pagados" tone="green" />
        <Stat value={totals.pending} label="Pendientes" tone="amber" />
        <Stat value={totals.overdue} label="Vencidos" tone={totals.overdue ? "red" : undefined} />
        <Stat value={formatMoney(totals.collectedCents)} label={`Cobrado de ${formatPeriod(period)}`} />
      </div>

      <form className="mt-8 mb-6 flex gap-2" role="search">
        {period !== current ? <input type="hidden" name="mes" value={period} /> : null}
        {sp.estado ? <input type="hidden" name="estado" value={sp.estado} /> : null}
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Nombre del cliente"
          aria-label="Buscar cliente"
          className="input max-w-md"
        />
        <button className="rounded-[var(--radius-sm)] border border-line bg-surface px-4 text-sm font-medium hover:border-ink-faint">
          Buscar
        </button>
      </form>

      <FilterTabs
        base={`/plataforma/pagos${qs({})}`.replace(/\?$/, "")}
        param="estado"
        current={sp.estado && FILTERS[sp.estado] ? sp.estado : ""}
        tabs={[
          { value: "", label: "Todos", count: rows.length },
          { value: "pagados", label: "Pagados", count: totals.paid },
          { value: "pendientes", label: "Pendientes", count: totals.pending },
          { value: "vencidos", label: "Vencidos", count: totals.overdue },
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState title="Nada que mostrar">Prueba con otro filtro o búsqueda.</EmptyState>
      ) : (
        <ul className="panel divide-y divide-line-soft">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/plataforma/pagos/${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.name}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    Corte el día {r.billingDay} ·{" "}
                    {r.lastPayment
                      ? `Último pago ${formatMoney(r.lastPayment.amountCents)} el ${r.lastPayment.paidOn}`
                      : "Sin pagos registrados"}
                  </p>
                </div>
                <Badge tone={TONE[r.status]}>{BILLING_STATUS_LABEL[r.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
