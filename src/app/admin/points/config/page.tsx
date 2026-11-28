import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import { Badge, EmptyState, PageHeader, Section } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { restaurantScope } from "@/lib/authz";
import { listRewards, MAX_POINTS_PER_SURVEY } from "@/lib/loyalty";
import { AddReward, RewardRowActions, SurveyPointsForm } from "./config-forms";

export const metadata = { title: "Premios y configuración de puntos" };

export default async function PointsConfigPage() {
  const admin = await requireAdmin();
  const branches = await db
    .select({ id: restaurants.id, name: restaurants.name, loyaltyPoints: restaurants.loyaltyPoints, active: restaurants.active })
    .from(restaurants)
    .where(and(eq(restaurants.organizationId, admin.organizationId), restaurantScope(admin, restaurants.id)))
    .orderBy(asc(restaurants.name));
  const rewards = await listRewards(admin.organizationId);

  return (
    <>
      <PageHeader
        title="Premios y configuración"
        back={
          <Link href="/admin/points" className="link">
            Puntos
          </Link>
        }
        description="Los puntos son de toda la cadena: el comensal junta en una sucursal y canjea en cualquiera."
      />

      <Section
        title="Puntos por encuesta"
        description={`Cuántos puntos gana el comensal al contestar en cada sucursal (máximo ${MAX_POINTS_PER_SURVEY.toLocaleString(
          "es-MX",
        )}). Con 0 la encuesta no pide el celular. Se dan una vez al día por celular y sucursal.`}
      >
        {branches.length === 0 ? (
          <EmptyState title="Aún no hay restaurantes" />
        ) : (
          <SurveyPointsForm branches={branches} max={MAX_POINTS_PER_SURVEY} />
        )}
      </Section>

      <Section
        title="Catálogo de premios"
        description="Lo que el comensal puede canjear con sus puntos. Un premio desactivado ya no aparece para canjear, pero su historial se conserva."
        actions={<AddReward />}
        className="mt-12"
      >
        {rewards.length === 0 ? (
          <EmptyState title="Aún no hay premios" action={<AddReward />}>
            Por ejemplo: “Postre de la casa” por 100 puntos o “Bebida gratis” por 60.
          </EmptyState>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="min-w-[140px]">Premio</th>
                  <th className="text-right">Puntos</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rewards.map((r) => (
                  <tr key={r.id} className={r.active ? "" : "text-ink-faint"}>
                    <td>
                      <p className="font-medium">{r.name}</p>
                      {r.description ? <p className="text-[13px] text-ink-soft">{r.description}</p> : null}
                    </td>
                    <td className="text-right tabular-nums">{r.pointsCost.toLocaleString("es-MX")}</td>
                    <td>{r.active ? <Badge tone="green">Activo</Badge> : <Badge>Desactivado</Badge>}</td>
                    <td className="text-right">
                      <RewardRowActions
                        reward={{
                          id: r.id,
                          name: r.name,
                          description: r.description,
                          pointsCost: r.pointsCost,
                          active: r.active,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
