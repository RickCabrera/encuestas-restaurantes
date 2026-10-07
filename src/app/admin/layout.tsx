import { cookies } from "next/headers";
import { Suspense } from "react";
import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { RESTAURANT_COOKIE } from "@/lib/filters";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import { RestaurantSelector } from "./restaurant-selector";
import { Sidebar } from "./sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const restaurants = await listAccessibleRestaurants(user);
  const selected = (await cookies()).get(RESTAURANT_COOKIE)?.value ?? "all";

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
        <main className="mx-auto max-w-[1200px] px-5 py-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
