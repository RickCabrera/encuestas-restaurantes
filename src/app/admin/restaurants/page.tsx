import { asc, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Restaurantes" };

export default async function RestaurantsPage() {
  await requireAdmin();
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      active: restaurants.active,
      // Subconsultas correlacionadas con nombres calificados: sin JOIN, Drizzle omite el nombre
      // de la tabla y "id" se resolvería contra la tabla de la subconsulta.
      activeSurvey: sql<
        string | null
      >`(select s.title from surveys s where s.restaurant_id = restaurants.id and s.status = 'ACTIVE' limit 1)`,
      devices: sql<number>`(select count(*)::int from devices d where d.restaurant_id = restaurants.id and d.active and d.token_hash is not null)`,
      responses: sql<number>`(select count(*)::int from responses r where r.restaurant_id = restaurants.id)`,
    })
    .from(restaurants)
    .orderBy(asc(restaurants.name));

  return (
    <>
      <PageHeader
        title="Restaurantes"
        description="Cada restaurante tiene su propia encuesta, tablets y código QR."
        actions={<ButtonLink href="/admin/restaurants/new">Agregar restaurante</ButtonLink>}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Aún no hay restaurantes"
          action={<ButtonLink href="/admin/restaurants/new">Agregar el primero</ButtonLink>}
        >
          Da de alta tus sucursales para asignarles una encuesta.
        </EmptyState>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Restaurante</th>
                <th>Encuesta activa</th>
                <th className="text-right">Tablets vinculadas</th>
                <th className="text-right">Respuestas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/restaurants/${r.id}`} className="font-medium hover:text-basil hover:underline">
                      {r.name}
                    </Link>
                    <div className="text-[13px] text-ink-faint">/r/{r.slug}</div>
                  </td>
                  <td>{r.activeSurvey ?? <span className="text-chile">Sin encuesta activa</span>}</td>
                  <td className="text-right tabular-nums">{r.devices}</td>
                  <td className="text-right tabular-nums">{r.responses.toLocaleString("es-MX")}</td>
                  <td>{r.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
