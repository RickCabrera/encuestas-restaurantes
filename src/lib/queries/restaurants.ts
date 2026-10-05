import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { restaurantScope } from "@/lib/authz";

/** Restaurantes visibles para el usuario (id y nombre), ordenados. */
export async function listAccessibleRestaurants(user: SessionUser, opts: { includeInactive?: boolean } = {}) {
  const scope = restaurantScope(user, restaurants.id);
  const rows = await db
    .select({ id: restaurants.id, name: restaurants.name, slug: restaurants.slug, active: restaurants.active })
    .from(restaurants)
    .where(scope)
    .orderBy(asc(restaurants.name));
  return opts.includeInactive ? rows : rows.filter((r) => r.active);
}

export async function getRestaurant(id: string) {
  return db.query.restaurants.findFirst({ where: eq(restaurants.id, id), columns: { logoData: false } });
}
