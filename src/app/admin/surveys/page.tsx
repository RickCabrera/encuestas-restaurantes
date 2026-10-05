import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { restaurants, surveys } from "@/db/schema";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/survey/status-badge";
import { requireUser } from "@/lib/auth";
import { restaurantScope } from "@/lib/authz";
import { formatDateTime } from "@/lib/dates";
import { parseFilters } from "@/lib/filters";

export const metadata = { title: "Encuestas" };

export default async function SurveysPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const f = await parseFilters(sp, user);
  const isAdmin = user.role === "ADMIN";

  const rows = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      status: surveys.status,
      version: surveys.version,
      publishedAt: surveys.publishedAt,
      updatedAt: surveys.updatedAt,
      restaurantId: restaurants.id,
      restaurantName: restaurants.name,
      questions: sql<number>`(select count(*)::int from questions q where q.survey_id = surveys.id)`,
      responses: sql<number>`(select count(*)::int from responses r where r.survey_id = surveys.id)`,
    })
    .from(surveys)
    .innerJoin(restaurants, eq(restaurants.id, surveys.restaurantId))
    .where(
      and(restaurantScope(user, surveys.restaurantId), f.restaurantId ? eq(surveys.restaurantId, f.restaurantId) : undefined),
    )
    .orderBy(
      restaurants.name,
      sql`case ${surveys.status} when 'ACTIVE' then 0 when 'DRAFT' then 1 else 2 end`,
      desc(surveys.version),
    );

  const byRestaurant = new Map<string, { name: string; items: typeof rows }>();
  for (const r of rows) {
    if (!byRestaurant.has(r.restaurantId)) byRestaurant.set(r.restaurantId, { name: r.restaurantName, items: [] });
    byRestaurant.get(r.restaurantId)!.items.push(r);
  }

  return (
    <>
      <PageHeader
        title="Encuestas"
        description={
          isAdmin
            ? "Cada restaurante tiene una encuesta activa. Las encuestas con respuestas no se editan: se duplican como nueva versión."
            : "La encuesta activa de cada restaurante y sus versiones anteriores."
        }
        actions={isAdmin ? <ButtonLink href="/admin/surveys/new">Nueva encuesta</ButtonLink> : null}
      />
      {sp.duplicated ? (
        <div className="mb-6">
          <Notice tone="green">Borradores creados. Aparecen como “Borrador” en cada restaurante.</Notice>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Aún no hay encuestas"
          action={isAdmin ? <ButtonLink href="/admin/surveys/new">Crear encuesta</ButtonLink> : null}
        >
          Crea una encuesta a partir de la plantilla base y publícala para que aparezca en las tablets y el QR.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          {[...byRestaurant.entries()].map(([rid, g]) => (
            <section key={rid}>
              <h2 className="mb-3 text-lg font-semibold">{g.name}</h2>
              <div className="panel overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Encuesta</th>
                      <th>Estado</th>
                      <th className="text-right">Preguntas</th>
                      <th className="text-right">Respuestas</th>
                      <th>Publicada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <Link href={`/admin/surveys/${s.id}`} className="font-medium hover:text-basil hover:underline">
                            {s.title}
                          </Link>{" "}
                          <span className="ml-1 text-[13px] text-ink-faint">versión {s.version}</span>
                        </td>
                        <td>
                          <StatusBadge status={s.status} />
                        </td>
                        <td className="text-right tabular-nums">{s.questions}</td>
                        <td className="text-right tabular-nums">
                          {s.responses > 0 ? (
                            <Link href={`/admin/surveys/${s.id}/results`} className="link">
                              {s.responses.toLocaleString("es-MX")}
                            </Link>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="text-ink-soft">{s.publishedAt ? formatDateTime(s.publishedAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
