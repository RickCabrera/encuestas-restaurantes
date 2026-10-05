import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { organizationScope, restaurantScope } from "@/lib/authz";
import { isUuid } from "@/lib/ids";

/** Restaurantes visibles para el usuario (id y nombre), ordenados. Siempre dentro de su cadena. */
export async function listAccessibleRestaurants(user: SessionUser, opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select({ id: restaurants.id, name: restaurants.name, slug: restaurants.slug, active: restaurants.active })
    .from(restaurants)
    .where(and(organizationScope(user, restaurants.organizationId), restaurantScope(user, restaurants.id)))
    .orderBy(asc(restaurants.name));
  return opts.includeInactive ? rows : rows.filter((r) => r.active);
}

/**
 * Restaurante por id, SIN revisar permisos. Solo para quien ya probó de otra forma que le toca
 * (la tablet vinculada pide el suyo). En el panel usa getAccessibleRestaurant.
 */
export async function getRestaurant(id: string) {
  return db.query.restaurants.findFirst({ where: eq(restaurants.id, id), columns: { logoData: false } });
}

/** Restaurante del panel: undefined si no existe, es de otra cadena o el usuario no lo tiene asignado. */
export async function getAccessibleRestaurant(user: SessionUser, id: string) {
  if (!isUuid(id)) return undefined;
  return db.query.restaurants.findFirst({
    where: and(
      eq(restaurants.id, id),
      organizationScope(user, restaurants.organizationId),
      restaurantScope(user, restaurants.id),
    ),
    columns: { logoData: false },
  });
}
