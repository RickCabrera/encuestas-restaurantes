import { asc } from "drizzle-orm";
import Link from "next/link";
import { setUserActiveAction } from "@/app/actions/users";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Notice, PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Usuarios" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireAdmin();
  const { saved } = await searchParams;
  const rows = await db.query.users.findMany({
    orderBy: asc(users.name),
    with: { restaurants: { with: { restaurant: { columns: { name: true } } } } },
  });

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Los administradores ven todo. Los gerentes solo ven los resultados de sus restaurantes."
        actions={<ButtonLink href="/admin/users/new">Agregar usuario</ButtonLink>}
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
    </>
  );
}
