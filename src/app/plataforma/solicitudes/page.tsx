import { Mail, MessageCircle, Phone } from "lucide-react";
import { createClientInviteAction, deleteDemoRequestAction, updateDemoRequestAction } from "@/app/actions/platform";
import { SpecForm } from "@/components/panel/spec-form";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import type { DemoRequestStatus } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { demoRequestCounts, listDemoRequests } from "@/lib/queries/platform";
import { LinkModal } from "../link-modal";
import { FilterTabs } from "../tabs";

export const metadata = { title: "Solicitudes" };

const STATUS: Record<DemoRequestStatus, { label: string; tone: "amber" | "neutral" | "green" | "red" }> = {
  NEW: { label: "Nueva", tone: "amber" },
  CONTACTED: { label: "Contactada", tone: "neutral" },
  CONVERTED: { label: "Ya es cliente", tone: "green" },
  DISCARDED: { label: "Descartada", tone: "red" },
};

function whatsapp(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.length === 10 ? `52${digits}` : digits}`;
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const status = (Object.keys(STATUS) as DemoRequestStatus[]).find((s) => s === estado);
  const [rows, counts] = await Promise.all([listDemoRequests(status), demoRequestCounts()]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Solicitudes"
        description="Las personas que pidieron una demo o cotización desde la página de inicio. A cada una le avisamos por correo a los administradores."
      />
      <FilterTabs
        base="/plataforma/solicitudes"
        param="estado"
        current={status ?? ""}
        tabs={[
          { value: "", label: "Todas", count: total },
          ...(Object.keys(STATUS) as DemoRequestStatus[]).map((s) => ({ value: s, label: STATUS[s].label, count: counts[s] })),
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title="Sin solicitudes aquí">
          Cuando alguien llene el formulario de la página de inicio aparecerá en esta lista.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                    {r.business} <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {r.name}
                    {r.city ? ` · ${r.city}` : ""}
                    {r.branches ? ` · ${r.branches} ${r.branches === "1" ? "sucursal" : "sucursales"}` : ""} ·{" "}
                    {formatDateTime(r.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Siempre se monta (aunque ya sea cliente): al generar el enlace la lista se
                      actualiza, y si el diálogo desapareciera se perdería el enlace en pantalla. */}
                  <LinkModal
                    action={createClientInviteAction}
                    title={`Dar de alta a ${r.business}`}
                    triggerLabel={r.status === "CONVERTED" ? "Otro enlace" : "Dar de alta"}
                    triggerVariant={r.status === "CONVERTED" ? "secondary" : "primary"}
                    triggerSize="sm"
                    withContact
                    defaults={{ email: r.email, contactName: r.name, requestId: r.id }}
                    description="Genera su enlace de alta (un solo uso, vence en 7 días). La solicitud queda como «Ya es cliente»."
                  />
                  <form action={deleteDemoRequestAction.bind(null, r.id)}>
                    <ConfirmSubmit variant="ghost" size="sm" message="¿Borrar esta solicitud?">
                      Borrar
                    </ConfirmSubmit>
                  </form>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <a href={`mailto:${r.email}`} className="link inline-flex items-center gap-1.5">
                  <Mail size={15} aria-hidden /> {r.email}
                </a>
                {r.phone ? (
                  <>
                    <a href={`tel:${r.phone}`} className="link inline-flex items-center gap-1.5">
                      <Phone size={15} aria-hidden /> {r.phone}
                    </a>
                    <a
                      href={whatsapp(r.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="link inline-flex items-center gap-1.5"
                    >
                      <MessageCircle size={15} aria-hidden /> WhatsApp
                    </a>
                  </>
                ) : null}
              </div>
              {r.message ? (
                <p className="mt-3 rounded-[var(--radius-sm)] bg-surface-2 px-4 py-3 text-[15px] whitespace-pre-wrap">
                  {r.message}
                </p>
              ) : null}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-ink-soft hover:text-ink">Seguimiento</summary>
                <SpecForm
                  className="mt-3"
                  action={updateDemoRequestAction.bind(null, r.id)}
                  submitLabel="Guardar"
                  fields={[
                    {
                      name: "status",
                      label: "Estado",
                      type: "select",
                      defaultValue: r.status,
                      options: (Object.keys(STATUS) as DemoRequestStatus[]).map((s) => ({ value: s, label: STATUS[s].label })),
                    },
                    { name: "notes", label: "Notas internas", type: "textarea", defaultValue: r.notes ?? "" },
                  ]}
                />
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
