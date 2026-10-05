import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, restaurants, userRestaurants, type User } from "@/db/schema";

export type SessionUser = Pick<User, "id" | "name" | "email" | "role" | "notifyLowScores" | "organizationId"> & {
  organizationName: string;
  /**
   * Restaurantes que puede ver: todos los de su cadena (admin) o los que tiene asignados (gerente).
   * Nunca incluye restaurantes de otra cadena, así que todo el alcance del panel sale de esta lista.
   */
  restaurantIds: string[];
};

/** Arma el usuario de sesión con su cadena y su alcance. Devuelve null si su cadena ya no existe. */
export async function buildSessionUser(user: User): Promise<SessionUser | null> {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) });
  if (!org) return null;
  const inOrg = eq(restaurants.organizationId, user.organizationId);
  const rows =
    user.role === "ADMIN"
      ? await db.select({ id: restaurants.id }).from(restaurants).where(inOrg)
      : await db
          .select({ id: restaurants.id })
          .from(userRestaurants)
          // El cruce con la cadena descarta cualquier asignación a un restaurante ajeno.
          .innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
          .where(and(eq(userRestaurants.userId, user.id), inOrg));
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    notifyLowScores: user.notifyLowScores,
    organizationId: user.organizationId,
    organizationName: org.name,
    restaurantIds: rows.map((r) => r.id),
  };
}
