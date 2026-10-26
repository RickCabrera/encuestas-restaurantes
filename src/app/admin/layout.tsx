import { cookies } from "next/headers";
import { Suspense } from "react";
import { logoutAction } from "@/app/actions/auth";
import { acknowledgeLocalAddressAction } from "@/app/actions/local-address";
import { Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth";
import { RESTAURANT_COOKIE } from "@/lib/filters";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import { changedLocalAddress } from "@/lib/request";
import { RestaurantSelector } from "./restaurant-selector";
import { Sidebar } from "./sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const restaurants = await listAccessibleRestaurants(user);
  const selected = (await cookies()).get(RESTAURANT_COOKIE)?.value ?? "all";
  const ipChange = user.role === "ADMIN" ? await changedLocalAddress() : null;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {/* APP_VERSION la define el servicio de la versión instalada en PC; en nube no existe. */}
      <Sidebar
        isAdmin={user.role === "ADMIN"}
        organizationName={user.organizationName}
        version={process.env.APP_VERSION || null}
      />
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3 lg:px-10">
          <Suspense fallback={<div className="h-9" />}>
            <RestaurantSelector
              restaurants={restaurants.map((r) => ({ id: r.id, name: r.name }))}
              selected={restaurants.some((r) => r.id === selected) ? selected : "all"}
            />
          </Suspense>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline">
              {user.name}
              {user.role === "MANAGER" ? " (gerente)" : ""}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-[var(--radius-sm)] px-2 py-1 text-ink-soft hover:bg-line-soft hover:text-ink"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-[1200px] px-5 py-8 lg:px-10 lg:py-10">
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
