import { and, asc, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { cancelInviteAction } from "@/app/actions/invites";
import { setUserActiveAction } from "@/app/actions/users";
import { db } from "@/db";
import { signupInvites, users } from "@/db/schema";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Notice, PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import { InviteWithLink } from "./invite-link";

export const metadata = { title: "Usuarios" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireAdmin();
  const { saved } = await searchParams;
  const rows = await db.query.users.findMany({
    orderBy: asc(users.name),
    with: { restaurants: { with: { restaurant: { columns: { name: true } } } } },
  });
  const restaurants = await listAccessibleRestaurants(me, { includeInactive: true });
  const restaurantName = new Map(restaurants.map((r) => [r.id, r.name]));
  const invites = await db.query.signupInvites.findMany({
    where: and(isNull(signupInvites.usedAt), gt(signupInvites.expiresAt, new Date())),
    orderBy: asc(signupInvites.createdAt),
  });

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Los administradores ven todo. Los gerentes solo ven los resultados de sus restaurantes."
        actions={
          <>
            <InviteWithLink restaurants={restaurants.map((r) => ({ id: r.id, name: r.name }))} />
            <ButtonLink href="/admin/users/new">Agregar usuario</ButtonLink>
          </>
        }
      />
      {saved ? (
        <div className="mb-6">
          <Notice tone="green">Usuario guardado.</Notice>
        </div>
      ) : null}
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Restaurantes</th>
              <th>Alertas</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className={u.active ? "" : "text-ink-faint"}>
                <td>
                  <Link href={`/admin/users/${u.id}`} className="font-medium hover:text-basil hover:underline">
                    {u.name}
                  </Link>
                  <div className="text-[13px] text-ink-faint">{u.email}</div>
                </td>
                <td>{u.role === "ADMIN" ? "Administrador" : "Gerente"}</td>
                <td className="max-w-[280px]">
                  {u.role === "ADMIN" ? "Todos" : u.restaurants.map((r) => r.restaurant.name).join(", ") || "—"}
                </td>
                <td>{u.notifyLowScores ? "Calificaciones bajas" : "—"}</td>
                <td>{u.active ? <Badge tone="green">Activo</Badge> : <Badge>Desactivado</Badge>}</td>
                <td className="text-right">
                  {u.id !== me.id ? (
                    <form action={setUserActiveAction.bind(null, u.id, !u.active)}>
                      <ConfirmSubmit
                        variant="ghost"
                        size="sm"
                        message={
                          u.active
                            ? `¿Desactivar a ${u.name}? Se cerrará su sesión y no podrá entrar.`
                            : `¿Reactivar a ${u.name}?`
                        }
                      >
                        {u.active ? "Desactivar" : "Reactivar"}
                      </ConfirmSubmit>
                    </form>
                  ) : (
                    <span className="text-[13px] text-ink-faint">Tú</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invites.length > 0 ? (
        <section className="mt-10" aria-labelledby="invites-heading">
          <h2 id="invites-heading" className="text-lg font-semibold">
            Invitaciones pendientes
          </h2>
          <p className="mt-1 mb-4 max-w-2xl text-sm text-ink-soft">
            Enlaces de registro que todavía no se usan. Por seguridad el enlace no se vuelve a mostrar: si se perdió, cancela la
            invitación y genera otra.
          </p>
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Restaurantes</th>
                  <th>Creada</th>
                  <th>Vence</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.role === "ADMIN" ? "Administrador" : "Gerente"}</td>
                    <td className="max-w-[280px]">
                      {inv.role === "ADMIN"
                        ? "Todos"
                        : inv.restaurantIds.map((id) => restaurantName.get(id) ?? "(eliminado)").join(", ") || "—"}
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(inv.createdAt)}</td>
                    <td className="whitespace-nowrap">{formatDateTime(inv.expiresAt)}</td>
                    <td className="text-right">
                      <form action={cancelInviteAction.bind(null, inv.id)}>
                        <ConfirmSubmit variant="ghost" size="sm" message="¿Cancelar esta invitación? Su enlace dejará de servir.">
                          Cancelar
                        </ConfirmSubmit>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
