import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setRestaurantActiveAction, updateRestaurantAction } from "@/app/actions/restaurants";
import { db } from "@/db";
import { surveys } from "@/db/schema";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Notice, PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { logoUrl } from "@/lib/ids";
import { getAccessibleRestaurant } from "@/lib/queries/restaurants";
import { appUrl } from "@/lib/request";
import { RestaurantForm } from "../restaurant-form";
import { TableQrForm } from "./table-qr-form";

export const metadata = { title: "Restaurante" };

export default async function RestaurantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;
  const r = await getAccessibleRestaurant(admin, id);
  if (!r) notFound();
  const base = await appUrl();
  const activeSurvey = await db.query.surveys.findFirst({
    where: and(eq(surveys.restaurantId, r.id), eq(surveys.status, "ACTIVE")),
    columns: { id: true, title: true },
  });
  const surveyUrl = `${base}/r/${r.slug}`;

  return (
    <>
      <PageHeader
        title={r.name}
        back={
          <Link href="/admin/restaurants" className="link">
            Restaurantes
          </Link>
        }
        description={
          <>
            {r.active ? <Badge tone="green">Activo</Badge> : <Badge>Inactivo</Badge>}{" "}
            <a href={surveyUrl} target="_blank" rel="noreferrer" className="link ml-1">
              {surveyUrl.replace(/^https?:\/\//, "")}
            </a>
          </>
        }
        actions={
          <form action={setRestaurantActiveAction.bind(null, r.id, !r.active)}>
            <ConfirmSubmit
              variant={r.active ? "danger" : "secondary"}
              message={
                r.active
                  ? `¿Desactivar ${r.name}?\n\nSu encuesta dejará de mostrarse en tablets y QR. Las respuestas se conservan.`
                  : `¿Reactivar ${r.name}?`
              }
            >
              {r.active ? "Desactivar" : "Reactivar"}
            </ConfirmSubmit>
          </form>
        }
      />

      <div className="space-y-4">
        {created ? <Notice tone="green">Restaurante creado. Ahora asígnale una encuesta.</Notice> : null}
        {!r.active ? (
          <Notice tone="amber">
            Este restaurante está inactivo: su encuesta no se muestra y sus tablets quedan en pausa. Las respuestas se conservan.
          </Notice>
        ) : null}
      </div>

      <section className="mt-8 grid gap-5 md:grid-cols-[220px_1fr]">
        <div>
          <h2 className="text-lg font-semibold">Encuesta</h2>
          <p className="mt-1 text-sm text-ink-soft">Solo una encuesta puede estar activa a la vez.</p>
        </div>
        <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
          {activeSurvey ? (
            <p>
              Activa: <span className="font-medium">{activeSurvey.title}</span>
            </p>
          ) : (
            <p className="text-chile">Sin encuesta activa. Los comensales verán “Encuesta no disponible”.</p>
          )}
          <div className="flex gap-2">
            {activeSurvey ? (
              <ButtonLink href={`/admin/surveys/${activeSurvey.id}`} variant="secondary">
                Ver encuesta
              </ButtonLink>
            ) : (
              <ButtonLink href={`/admin/surveys/new?restaurant=${r.id}`}>Crear encuesta</ButtonLink>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-[220px_1fr]">
        <div>
          <h2 className="text-lg font-semibold">Código QR</h2>
          <p className="mt-1 text-sm text-ink-soft">Para que el comensal responda desde su celular.</p>
        </div>
        <div className="panel space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr/${r.id}?format=png`}
              alt={`Código QR de ${r.name}`}
              className="h-28 w-28 rounded border border-line"
            />
            <div className="flex flex-wrap gap-2">
              <a className={buttonClass("secondary")} href={`/api/qr/${r.id}?format=png&download=1`}>
                Descargar PNG
              </a>
              <a className={buttonClass("secondary")} href={`/api/qr/${r.id}?format=pdf`}>
                Descargar PDF para imprimir
              </a>
            </div>
          </div>
          <TableQrForm restaurantId={r.id} />
        </div>
      </section>

      <div className="mt-12">
        <RestaurantForm
          action={updateRestaurantAction.bind(null, r.id)}
          appUrl={base}
          values={{
            id: r.id,
            name: r.name,
            slug: r.slug,
            address: r.address,
            primaryColor: r.primaryColor,
            kioskResetSeconds: r.kioskResetSeconds,
            kioskIdleSeconds: r.kioskIdleSeconds,
            hasLogo: !!r.logoMime,
            logoUrl: r.logoMime ? logoUrl(r) : undefined,
          }}
        />
      </div>
    </>
  );
}
