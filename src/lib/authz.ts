import "server-only";
import { inArray, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { SessionUser } from "./auth";

export class ForbiddenError extends Error {
  constructor(message = "No tienes acceso a este recurso") {
    super(message);
  }
}

export function canAccessRestaurant(user: SessionUser, restaurantId: string) {
  return user.restaurantIds === null || user.restaurantIds.includes(restaurantId);
}

export function assertRestaurantAccess(user: SessionUser, restaurantId: string) {
  if (!canAccessRestaurant(user, restaurantId)) throw new ForbiddenError();
}

export function assertAdmin(user: SessionUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError("Solo un administrador puede hacer esto");
}

/**
 * Condición SQL que limita una columna restaurant_id a lo que el usuario puede ver.
 * Devuelve undefined para admins (sin restricción).
 */
export function restaurantScope(user: SessionUser, column: PgColumn): SQL | undefined {
  if (user.restaurantIds === null) return undefined;
  if (user.restaurantIds.length === 0) return sql`false`;
  return inArray(column, user.restaurantIds);
}
