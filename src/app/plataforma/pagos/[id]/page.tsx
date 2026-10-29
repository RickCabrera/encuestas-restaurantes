import Link from "next/link";
import { notFound } from "next/navigation";
import { registerPaymentAction, restorePaymentAction, setBillingDayAction, voidPaymentAction } from "@/app/actions/platform";
import { ModalForm, SpecForm } from "@/components/panel/spec-form";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, Section } from "@/components/ui/primitives";
import {
  BILLING_DAY_MAX,
  BILLING_DAY_MIN,
  BILLING_STATUS_LABEL,
  formatMoney,
  formatPeriod,
  PAYMENT_METHOD_LABEL,
  periodOf,
  shiftPeriod,
} from "@/lib/billing";
import { dayInTz, formatDateTime } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { clientBillingStatus, getClientOrg, listPayments } from "@/lib/queries/platform";

export const metadata = { title: "Pagos del cliente" };

function formatDayLong(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", dateStyle: "medium" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export default async function ClientPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const org = await getClientOrg(id);
  if (!org) notFound();
  const [history, billing] = await Promise.all([listPayments(id), clientBillingStatus(org)]);
  const current = periodOf(new Date());
  const lastAmount = history.find((p) => !p.voidedAt)?.amountCents;
  const periods = Array.from({ length: 8 }, (_, i) => shiftPeriod(current, 1 - i));
  const tone = billing.status === "PAID" ? "green" : billing.status === "OVERDUE" ? "red" : "amber";

  const registerForm = (
    <ModalForm
      action={registerPaymentAction.bind(null, org.id)}
      title="Registrar pago"
      triggerLabel="Registrar pago"
      triggerVariant="primary"
      submitLabel="Registrar pago"
      fields={[
        {
          name: "period",
          label: "Mes que cubre",
          type: "select",
          defaultValue: current,
          options: periods.map((p) => ({ value: p, label: formatPeriod(p) })),
        },
        {
          name: "amount",
          label: "Monto (MXN)",
          defaultValue: lastAmount ? String(lastAmount / 100) : "",
          placeholder: "999",
        },
        {
          name: "method",
          label: "Forma de pago",
          type: "select",
          defaultValue: "TRANSFER",
          options: Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label })),
        },
        { name: "paidOn", label: "Fecha de pago", type: "date", defaultValue: dayInTz(new Date()) },
        { name: "notes", label: "Notas (opcional)", type: "textarea", placeholder: "Folio de la transferencia, factura…" },
      ]}
    />
  );

  return (
    <>
      <PageHeader
        back={
          <Link href="/plataforma/pagos" className="link">
            ‹ Pagos
          </Link>
        }
        title={org.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>
              {formatPeriod(billing.period)}: {BILLING_STATUS_LABEL[billing.status].toLowerCase()}
            </Badge>
            <Link href={`/plataforma/clientes/${org.id}`} className="link text-sm">
              Ver ficha del cliente
            </Link>
          </span>
        }
        actions={registerForm}
      />

      <Section title="Día de corte">
        <div className="panel max-w-xl p-5">
          <SpecForm
            action={setBillingDayAction.bind(null, org.id)}
            submitLabel="Guardar día de corte"
            fields={[
              {
                name: "billingDay",
                label: "Día del mes",
                type: "number",
                min: BILLING_DAY_MIN,
                max: BILLING_DAY_MAX,
                defaultValue: String(org.billingDay),
                hint: `Del ${BILLING_DAY_MIN} al ${BILLING_DAY_MAX}. Si pasa ese día sin pago registrado, el mes sale como vencido.`,
                wide: true,
              },
            ]}
          />
        </div>
      </Section>

      <Section title="Historial de pagos">
        {history.length === 0 ? (
          <EmptyState title="Sin pagos registrados" action={registerForm} />
        ) : (
          <ul className="panel divide-y divide-line-soft">
            {history.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className={p.voidedAt ? "text-ink-faint line-through" : ""}>
                      {formatPeriod(p.period)} · {formatMoney(p.amountCents)}
                    </span>
                    {p.voidedAt ? <Badge>Anulado</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    Pagado el {formatDayLong(p.paidOn)} · {PAYMENT_METHOD_LABEL[p.method]} · lo registró {p.recordedByName}
                  </p>
                  {p.notes ? <p className="mt-1 text-sm">{p.notes}</p> : null}
                  {p.voidedAt ? (
                    <p className="mt-1 text-sm">
                      Anulado el {formatDateTime(p.voidedAt)} por {p.voidedByName}. Motivo: {p.voidReason}
                    </p>
                  ) : null}
                </div>
                {p.voidedAt ? (
                  <form action={restorePaymentAction.bind(null, p.id)}>
                    <Button type="submit" variant="secondary" size="sm">
                      Restaurar
                    </Button>
                  </form>
                ) : (
                  <ModalForm
                    action={voidPaymentAction.bind(null, p.id)}
                    title="Anular pago"
                    triggerLabel="Anular"
                    triggerVariant="ghost"
                    triggerSize="sm"
                    submitVariant="danger"
                    submitLabel="Anular pago"
                    description="El pago se conserva en el historial como anulado y se puede restaurar."
                    fields={[{ name: "reason", label: "Motivo", wide: true, placeholder: "Se capturó dos veces, rebotó…" }]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
