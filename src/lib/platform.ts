// Sin "server-only": también lo usa scripts/platform-admin.ts.
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";

/** Cadena interna donde viven las cuentas del equipo que opera Sobremesa. No es un cliente. */
export const INTERNAL_ORG_NAME = "Equipo Sobremesa";

export async function getOrCreateInternalOrg() {
  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.internal, true),
    orderBy: (o, { asc }) => asc(o.createdAt),
  });
  if (existing) return existing;
  const [created] = await db.insert(organizations).values({ name: INTERNAL_ORG_NAME, internal: true }).returning();
  return created;
}

/** Administradores de la plataforma activos (para no dejar la Administración sin nadie). */
export async function countActivePlatformAdmins() {
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.platformAdmin, true), eq(users.active, true)));
  return n;
}
