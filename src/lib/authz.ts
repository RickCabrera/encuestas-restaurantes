import "server-only";
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { SessionUser } from "./auth";

export class ForbiddenError extends Error {
  constructor(message = "No tienes acceso a este recurso") {
    super(message);
  }
}

/** El restaurante es de la cadena del usuario y, si es gerente, además lo tiene asignado. */
export function canAccessRestaurant(user: SessionUser, restaurantId: string) {
  return user.restaurantIds.includes(restaurantId);
}

export function assertRestaurantAccess(user: SessionUser, restaurantId: string) {
  if (!canAccessRestaurant(user, restaurantId)) throw new ForbiddenError();
}

export function assertAdmin(user: SessionUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError("Solo un administrador puede hacer esto");
}

/**
 * Condición SQL que limita una columna restaurant_id a lo que el usuario puede ver.
 * Siempre restringe: el administrador lo es de SU cadena, no de todo el sistema.
 */
export function restaurantScope(user: SessionUser, column: PgColumn): SQL {
  if (user.restaurantIds.length === 0) return sql`false`;
  return inArray(column, user.restaurantIds);
}

/** Condición SQL que limita una columna organization_id a la cadena del usuario. */
export function organizationScope(user: SessionUser, column: PgColumn): SQL {
  return eq(column, user.organizationId);
}
