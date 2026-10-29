import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { acknowledgeLocalAddressAction } from "@/app/actions/local-address";
import { Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { isLocalMode } from "@/lib/app-mode";
import { syncNowAction } from "@/app/actions/sync";
import { db } from "@/db";
import { organizations, orgLicenses } from "@/db/schema";
import { requireClientUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { RESTAURANT_COOKIE } from "@/lib/filters";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import { changedLocalAddress } from "@/lib/request";
import { THEME_COOKIE } from "@/lib/ui-theme";
import { RestaurantSelector } from "./restaurant-selector";
import { Sidebar } from "./sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClientUser();
  const restaurants = await listAccessibleRestaurants(user);
  const selected = (await cookies()).get(RESTAURANT_COOKIE)?.value ?? "all";
  const ipChange = user.role === "ADMIN" ? await changedLocalAddress() : null;
  const localOnly =
    !isLocalMode() &&
    (await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId), columns: { pcMode: true } }))
      ?.pcMode === "LOCAL";
  const sync = isLocalMode()
    ? await db.query.orgLicenses.findFirst({ where: eq(orgLicenses.organizationId, user.organizationId) })
    : null;

  const theme = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";

  return (
    <div id="panel-root" data-theme={theme} className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[264px_1fr]">
      {/* APP_VERSION la define el servicio de la versión instalada en PC; en nube no existe. */}
      <Sidebar
        isAdmin={user.role === "ADMIN"}
        isPlatformAdmin={user.platformAdmin && !isLocalMode()}
        organizationName={user.organizationName}
        userName={user.role === "MANAGER" ? `${user.name} (gerente)` : user.name}
        userEmail={user.email}
        version={process.env.APP_VERSION || null}
        theme={theme}
      />
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper/85 px-5 py-3 backdrop-blur lg:px-10">
          <Suspense fallback={<div className="h-9" />}>
            <RestaurantSelector
              restaurants={restaurants.map((r) => ({ id: r.id, name: r.name }))}
              selected={restaurants.some((r) => r.id === selected) ? selected : "all"}
            />
          </Suspense>
        </header>
        <main className="mx-auto max-w-[1200px] px-5 py-8 lg:px-10 lg:py-10">
          {localOnly ? (
            <div className="mb-6">
              <Notice tone="amber">
                <strong>Tu negocio usa Sobremesa instalado en tu PC.</strong> Sus restaurantes, encuestas y respuestas viven en
                esa PC, así que aquí en la web no se ven. Ábrelo desde el acceso directo de Sobremesa en tu PC.
              </Notice>
            </div>
          ) : null}
          {sync?.mode === "SYNC" ? (
            <div className="mb-6">
              <Notice tone={sync.lastSyncError ? "amber" : "neutral"}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p className="min-w-0 flex-1">
                    <strong>Sincronizado con la nube.</strong>{" "}
                    {sync.lastSyncAt ? `Última vez: ${formatDateTime(sync.lastSyncAt)}` : "Todavía no se sincroniza"}.{" "}
                    {sync.lastSyncError ?? "Lo que cambies aquí o en la web se ve en los dos lados en un par de minutos."}
                  </p>
                  <form action={syncNowAction}>
                    <SubmitButton variant="secondary" size="sm" pendingText="Sincronizando…">
                      Sincronizar ahora
                    </SubmitButton>
                  </form>
                </div>
              </Notice>
            </div>
          ) : null}
          {ipChange ? (
            <div className="mb-6">
              <Notice tone="amber">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                  <p className="min-w-0 flex-1">
                    <strong>La IP de esta PC cambió</strong> de {ipChange.configured.replace(/^https?:\/\//, "")} a{" "}
                    {ipChange.current.replace(/^https?:\/\//, "")}. No tienes que hacer nada en el sistema: el panel y las tablets
                    con la app actualizada ya usan la nueva. Solo los <strong>QR que imprimiste antes</strong> llevan la dirección
                    anterior: vuelve a imprimirlos (o en el router reserva para esta PC la IP anterior).
                  </p>
                  <form action={acknowledgeLocalAddressAction}>
                    <SubmitButton variant="secondary" size="sm" pendingText="Ocultando…">
                      Entendido, ocultar aviso
                    </SubmitButton>
                  </form>
                </div>
              </Notice>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
