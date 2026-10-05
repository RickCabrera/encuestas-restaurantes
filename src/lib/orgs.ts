// Sin "server-only": también lo usan los scripts (seed, invite:org, org:delete).
import { count, eq, inArray, or } from "drizzle-orm";
import { db, type Db } from "@/db";
import { devices, organizations, responses, restaurants, signupInvites, surveys, users, type Organization } from "@/db/schema";

/** Cadena con los datos de demostración. Es la única que org:delete nunca borra. */
export const DEMO_ORG_NAME = "Demo";
export const ORG_NAME_MIN = 2;
export const ORG_NAME_MAX = 80;

/** "Demo" con cualquier combinación de mayúsculas o espacios alrededor. */
export function isProtectedOrgName(name: string) {
  return name.trim().toLowerCase() === DEMO_ORG_NAME.toLowerCase();
}

/** La cadena "Demo" (la crea la migración; aquí se vuelve a crear si el seed vació la base). */
export async function getOrCreateDemoOrg() {
  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.name, DEMO_ORG_NAME),
    orderBy: (o, { asc }) => asc(o.createdAt),
  });
  if (existing) return existing;
  const [created] = await db.insert(organizations).values({ name: DEMO_ORG_NAME }).returning();
  return created;
}

export type OrgCounts = {
  restaurants: number;
  users: number;
  surveys: number;
  devices: number;
  responses: number;
  invites: number;
};

type Executor = Omit<Db, "$client">;

const orgRestaurants = (ex: Executor, orgId: string) =>
  ex.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.organizationId, orgId));
const orgUsers = (ex: Executor, orgId: string) => ex.select({ id: users.id }).from(users).where(eq(users.organizationId, orgId));

/** Invitaciones de la cadena: las que generó su panel y el enlace NEW_ORG con el que se dio de alta. */
const orgInvites = (ex: Executor, orgId: string) =>
  or(eq(signupInvites.organizationId, orgId), inArray(signupInvites.usedByUserId, orgUsers(ex, orgId)));

/** Cuánto tiene una cadena (lo que org:delete muestra antes de borrar). */
export async function countOrganizationData(orgId: string, ex: Executor = db): Promise<OrgCounts> {
  const one = async (q: PromiseLike<{ n: number }[]>) => (await q)[0].n;
  const inRestaurants = orgRestaurants(ex, orgId);
  return {
    restaurants: await one(ex.select({ n: count() }).from(restaurants).where(eq(restaurants.organizationId, orgId))),
    users: await one(ex.select({ n: count() }).from(users).where(eq(users.organizationId, orgId))),
    surveys: await one(ex.select({ n: count() }).from(surveys).where(inArray(surveys.restaurantId, inRestaurants))),
    devices: await one(ex.select({ n: count() }).from(devices).where(inArray(devices.restaurantId, inRestaurants))),
    responses: await one(ex.select({ n: count() }).from(responses).where(inArray(responses.restaurantId, inRestaurants))),
    invites: await one(ex.select({ n: count() }).from(signupInvites).where(orgInvites(ex, orgId))),
  };
}

export type OrgLookup =
  | { ok: true; org: Organization }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "protected"; org: Organization }
  /** Varias cadenas con ese nombre: hay que elegir una por id. */
  | { ok: false; reason: "ambiguous"; matches: Organization[] };

/** Busca la cadena a borrar por id o por nombre exacto. "Demo" nunca se devuelve como borrable. */
export async function findOrganizationToDelete(by: { id: string } | { name: string }): Promise<OrgLookup> {
  const matches = await db.query.organizations.findMany({
    where: "id" in by ? eq(organizations.id, by.id) : eq(organizations.name, by.name),
    orderBy: (o, { asc }) => asc(o.createdAt),
  });
  if (matches.length === 0) return { ok: false, reason: "not_found" };
  if (matches.length > 1) return { ok: false, reason: "ambiguous", matches };
  const org = matches[0];
  if (isProtectedOrgName(org.name)) return { ok: false, reason: "protected", org };
  return { ok: true, org };
}

export class ProtectedOrganizationError extends Error {
  constructor() {
    super(`La cadena "${DEMO_ORG_NAME}" no se puede borrar.`);
  }
}

/**
 * Borra una cadena con todo lo suyo en una sola transacción: o se borra completa o no se borra nada.
 * Devuelve lo que borró, o null si ya no existía. Lanza ProtectedOrganizationError con "Demo".
 */
export async function deleteOrganization(orgId: string): Promise<{ org: Organization; counts: OrgCounts } | null> {
  return db.transaction(async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update");
    if (!org) return null;
    // Se vuelve a revisar aquí dentro: es la última barrera, pase lo que pase en quien llama.
    if (isProtectedOrgName(org.name)) throw new ProtectedOrganizationError();
    const counts = await countOrganizationData(org.id, tx);
    // Las invitaciones van primero: después de borrar los usuarios ya no se sabría cuál fue el enlace de alta.
    await tx.delete(signupInvites).where(orgInvites(tx, org.id));
    // Arrastra en cascada encuestas, preguntas, tablets, respuestas y asignaciones de gerentes.
    await tx.delete(restaurants).where(eq(restaurants.organizationId, org.id));
    // Arrastra en cascada sus enlaces para restablecer contraseña.
    await tx.delete(users).where(eq(users.organizationId, org.id));
    await tx.delete(organizations).where(eq(organizations.id, org.id));
    return { org, counts };
  });
}
