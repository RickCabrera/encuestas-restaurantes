import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { createClientInviteAction } from "@/app/actions/platform";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";
import { isProtectedOrgName } from "@/lib/orgs";
import { listClients } from "@/lib/queries/platform";
import { LinkModal } from "../link-modal";

export const metadata = { title: "Clientes" };

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ borrado?: string }> }) {
  const { borrado } = await searchParams;
  const clients = await listClients();
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Los negocios que usan Sobremesa."
        actions={
          <LinkModal
            action={createClientInviteAction}
            title="Dar de alta cliente"
            triggerLabel="Dar de alta cliente"
            withContact
            description="Se genera un enlace de un solo uso (vence en 7 días). Con él, el negocio escribe su nombre y crea su cuenta de administrador; después da de alta sus restaurantes, encuestas y tablets."
          />
        }
      />
      {borrado ? (
        <div className="mb-6">
          <Notice tone="green">El cliente se borró con todo lo suyo.</Notice>
        </div>
      ) : null}
      {clients.length === 0 ? (
        <EmptyState title="Todavía no hay clientes">Da de alta el primero con el botón de arriba.</EmptyState>
      ) : (
        <ul className="panel divide-y divide-line-soft overflow-hidden">
          {clients.map((c) => (
            <li key={c.id}>
              <Link
                href={`/plataforma/clientes/${c.id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {c.name}
                    {isProtectedOrgName(c.name) ? <Badge>Demo</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {plural(c.restaurants, "restaurante", "restaurantes")}, {plural(c.tablets, "tablet", "tablets")},{" "}
                    {plural(c.users, "usuario", "usuarios")}
                    <span className="hidden sm:inline">
                      {" · "}
                      {plural(c.responses30, "respuesta", "respuestas")} en 30 días
                      {c.lastResponseAt ? ` · última ${formatDateTime(c.lastResponseAt)}` : ""}
                    </span>
                  </p>
                </div>
                {c.pcs > 0 ? (
                  <Badge tone="amber">
                    {c.pcs === 1 ? "1 PC" : `${c.pcs} PCs`} · {c.pcRestaurants} rest. · {c.pcResponses30} resp.
                  </Badge>
                ) : null}
                {c.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Desactivado</Badge>}
                <ChevronRight size={18} className="text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
