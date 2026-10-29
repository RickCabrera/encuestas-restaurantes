import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClientAdminInviteAction,
  deleteClientAction,
  setClientActiveAction,
  updateClientAction,
} from "@/app/actions/platform";
import { ModalForm, SpecForm } from "@/components/panel/spec-form";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, PageHeader, Section, Stat } from "@/components/ui/primitives";
import { BILLING_STATUS_LABEL, formatPeriod } from "@/lib/billing";
import { formatDateTime } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { isProtectedOrgName } from "@/lib/orgs";
import { clientBillingStatus, getClientOrg, listClientRestaurants, listClients, listClientUsers } from "@/lib/queries/platform";
import { LinkModal } from "../../link-modal";

export const metadata = { title: "Cliente" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const org = await getClientOrg(id);
  if (!org) notFound();
  const [[summary], restaurants, people, billing] = await Promise.all([
    listClients({ id }),
    listClientRestaurants(id),
    listClientUsers(id),
    clientBillingStatus(org),
  ]);
  const isDemo = isProtectedOrgName(org.name);
  const billingTone = billing.status === "PAID" ? "green" : billing.status === "OVERDUE" ? "red" : "amber";

  return (
    <>
      <PageHeader
        back={
          <Link href="/plataforma/clientes" className="link">
            ‹ Clientes
          </Link>
        }
        title={org.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {org.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Desactivado</Badge>}
            <span>Cliente desde {formatDateTime(org.createdAt)}</span>
          </span>
        }
        actions={
          <form action={setClientActiveAction.bind(null, org.id, !org.active)}>
            <ConfirmSubmit
              variant={org.active ? "danger" : "primary"}
              message={
                org.active
                  ? `¿Desactivar a ${org.name}? Su gente ya no podrá entrar al panel y sus encuestas (QR y tablets) dejarán de recibir respuestas. Sus datos se conservan.`
                  : `¿Reactivar a ${org.name}?`
              }
            >
              {org.active ? "Desactivar cliente" : "Reactivar cliente"}
            </ConfirmSubmit>
          </form>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={summary.restaurants} label="Restaurantes" />
        <Stat value={summary.tablets} label="Tablets vinculadas" />
        <Stat value={summary.users} label="Usuarios activos" />
        <Stat value={summary.responses30} label="Respuestas en 30 días" />
      </div>

      <Section
        title="Pagos"
        description={
          <span className="flex flex-wrap items-center gap-2">
            Mensualidad de {formatPeriod(billing.period)}:{" "}
            <Badge tone={billingTone}>{BILLING_STATUS_LABEL[billing.status]}</Badge>
            <span>· corte el día {org.billingDay}</span>
          </span>
        }
        actions={
          <ButtonLink href={`/plataforma/pagos/${org.id}`} variant="secondary">
            Ver pagos y día de corte
          </ButtonLink>
        }
      />

      <Section title="Datos del cliente" description="Para saber a quién llamar. Solo los ve el equipo de Sobremesa.">
        <div className="panel p-5">
          <SpecForm
            action={updateClientAction.bind(null, org.id)}
            submitLabel="Guardar datos"
            fields={[
              { name: "name", label: "Nombre del negocio", defaultValue: org.name, wide: true },
              { name: "contactName", label: "Contacto", defaultValue: org.contactName ?? "" },
              { name: "contactPhone", label: "Teléfono", type: "tel", defaultValue: org.contactPhone ?? "" },
              { name: "contactEmail", label: "Correo", type: "email", defaultValue: org.contactEmail ?? "", wide: true },
              { name: "notes", label: "Notas", type: "textarea", defaultValue: org.notes ?? "" },
            ]}
          />
        </div>
      </Section>

      <Section title="Restaurantes" description="Las sucursales que el cliente dio de alta en su panel.">
        {restaurants.length === 0 ? (
          <div className="panel px-5 py-6 text-sm text-ink-soft">Todavía no da de alta restaurantes.</div>
        ) : (
          <ul className="panel divide-y divide-line-soft">
            {restaurants.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {r.name} {r.active ? null : <Badge>Inactivo</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {[r.address, r.active_survey ? `Encuesta: ${r.active_survey}` : "Sin encuesta publicada"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Badge tone={r.tablets > 0 ? "green" : "neutral"}>
                  {r.tablets} {r.tablets === 1 ? "tablet" : "tablets"}
                </Badge>
                <Badge>{r.responses30} resp. 30 días</Badge>
                <a href={`/r/${r.slug}`} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-sm">
                  Encuesta QR <ExternalLink size={14} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Usuarios"
        description="Quién entra al panel de este negocio."
        actions={
          <LinkModal
            action={createClientAdminInviteAction.bind(null, org.id)}
            title="Enlace para otro administrador"
            triggerLabel="Enlace para administrador"
            triggerVariant="secondary"
            description={`La persona que lo abra crea su cuenta como administrador de ${org.name}. Sirve una vez y vence en 7 días.`}
          />
        }
      >
        {people.length === 0 ? (
          <div className="panel px-5 py-6 text-sm text-ink-soft">Nadie se ha registrado todavía.</div>
        ) : (
          <ul className="panel divide-y divide-line-soft">
            {people.map((u) => (
              <li key={u.id} className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${u.active ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {u.name} <span className="text-sm font-normal text-ink-soft">· {u.email}</span>
                  </p>
                  <p className="text-[13px] text-ink-faint">
                    Último acceso: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "nunca"}
                  </p>
                </div>
                {u.platformAdmin ? <Badge tone="amber">Administración</Badge> : null}
                <Badge>{u.role === "ADMIN" ? "Administrador" : "Gerente"}</Badge>
                {u.active ? null : <Badge tone="red">Desactivado</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {isDemo ? null : (
        <Section
          title="Zona de peligro"
          description="Borrar el cliente elimina sus restaurantes, encuestas, tablets, respuestas, usuarios y pagos. No se puede deshacer."
        >
          <ModalForm
            action={deleteClientAction.bind(null, org.id)}
            title="Borrar cliente"
            triggerLabel="Borrar cliente"
            triggerVariant="danger"
            submitVariant="danger"
            submitLabel="Borrar para siempre"
            description={
              <>
                Escribe <strong className="text-ink">{org.name}</strong> para confirmar. Si solo quieres pausarlo, mejor
                desactívalo.
              </>
            }
            fields={[{ name: "confirm", label: "Nombre del cliente", wide: true }]}
          />
        </Section>
      )}
    </>
  );
}
