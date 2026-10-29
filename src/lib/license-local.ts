import "server-only";
import { hostname } from "node:os";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { after, connection } from "next/server";
import { db } from "@/db";
import {
  organizations,
  orgLicenses,
  surveys,
  restaurants,
  users,
  type InstallationStats,
  type User,
  type UserRole,
} from "@/db/schema";
import { isLocalMode } from "./app-mode";
import { randomToken } from "./crypto";
import { LICENSE_CHECK_EVERY_MS, verifyLicense } from "./license-token";
import { logger } from "./logger";
import { getSetting, setSetting } from "./settings";

/**
 * Lado PC de las licencias (versión instalada, APP_MODE=local).
 *
 * Cada cadena de la PC corresponde a un cliente de la nube (organizations.cloud_org_id) y tiene su
 * propia licencia firmada por la nube (org_licenses). Se entra con la cuenta de la nube: la PC la
 * valida en la nube y deja a esa persona dentro de la cadena de SU cliente. Una cadena sin cliente
 * de la nube, o con la licencia vencida o bloqueada, no opera: nadie entra, las tablets se
 * desvinculan y el QR no recibe respuestas.
 */
const DEFAULT_LICENSE_SERVER = "https://encuestas-restaurantes-production.up.railway.app";
/** Sin respuesta de la nube en este tiempo, se considera sin internet. */
const TIMEOUT_MS = 8000;

export function licenseServerUrl() {
  return (process.env.LICENSE_SERVER_URL || DEFAULT_LICENSE_SERVER).replace(/\/$/, "");
}

/** Llave aleatoria de esta PC: la nube la usa para reconocer la misma PC entre inicios de sesión. */
async function deviceKey() {
  const existing = await getSetting("device_key");
  if (existing) return existing;
  const key = randomToken(32);
  await setSetting("device_key", key);
  return key;
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${licenseServerUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, data };
}

/** Resumen de una cadena de esta PC, para verlo en la Administración (los datos no salen de la PC). */
export async function localStats(orgId: string): Promise<InstallationStats | null> {
  try {
    const [row] = await db.execute<{
      name: string;
      restaurants: number;
      tablets: number;
      users: number;
      responses30: number;
      last_response_at: Date | string | null;
    }>(sql`
      select o.name,
        (select count(*)::int from restaurants r where r.organization_id = o.id) as restaurants,
        (select count(*)::int from devices d join restaurants r on r.id = d.restaurant_id
           where r.organization_id = o.id and d.active and d.token_hash is not null) as tablets,
        (select count(*)::int from users u where u.organization_id = o.id and u.active) as users,
        (select count(*)::int from responses x join restaurants r on r.id = x.restaurant_id
           where r.organization_id = o.id and x.submitted_at > now() - interval '30 days') as responses30,
        (select max(x.submitted_at) from responses x join restaurants r on r.id = x.restaurant_id
           where r.organization_id = o.id) as last_response_at
      from organizations o where o.id = ${orgId}
    `);
    if (!row) return null;
    return {
      orgNames: [row.name],
      restaurants: Number(row.restaurants),
      tablets: Number(row.tablets),
      users: Number(row.users),
      responses30: Number(row.responses30),
      lastResponseAt: row.last_response_at ? new Date(row.last_response_at).toISOString() : null,
    };
  } catch {
    return null;
  }
}

// ───────────────────────── Estado de la licencia de una cadena ─────────────────────────

export type OrgLicenseStatus = "valid" | "unbound" | "expired" | "inactive" | "revoked";

export async function orgLicenseStatus(orgId: string): Promise<OrgLicenseStatus> {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId), columns: { cloudOrgId: true } });
  if (!org?.cloudOrgId) return "unbound";
  const lic = await db.query.orgLicenses.findFirst({ where: eq(orgLicenses.organizationId, orgId) });
  if (!lic) return "unbound";
  if (lic.block === "inactive" || lic.block === "revoked") return lic.block;
  const claims = await verifyLicense(lic.token);
  if (claims && claims.organizationId === org.cloudOrgId && claims.installationId === lic.installationId) return "valid";
  return "expired";
}

/** Pide a la nube la licencia nueva de una cadena. Sin internet no cambia nada. */
export async function renewOrgLicense(orgId: string): Promise<"ok" | "offline" | "inactive" | "revoked" | "none"> {
  const lic = await db.query.orgLicenses.findFirst({ where: eq(orgLicenses.organizationId, orgId) });
  if (!lic) return "none";
  await db.update(orgLicenses).set({ lastCheckAt: new Date() }).where(eq(orgLicenses.organizationId, orgId));
  try {
    const { status, data } = await postJson("/api/licencia/renovar", {
      installationId: lic.installationId,
      secret: lic.secret,
      version: process.env.APP_VERSION ?? null,
      stats: await localStats(orgId),
    });
    if (status === 200 && typeof data.license === "string") {
      await db
        .update(orgLicenses)
        .set({ token: data.license, block: null, updatedAt: new Date() })
        .where(eq(orgLicenses.organizationId, orgId));
      if (typeof data.organizationName === "string") {
        await db.update(organizations).set({ name: data.organizationName }).where(eq(organizations.id, orgId));
      }
      return "ok";
    }
    if (status === 403 && (data.error === "inactive" || data.error === "revoked")) {
      await db
        .update(orgLicenses)
        .set({ token: null, block: data.error, updatedAt: new Date() })
        .where(eq(orgLicenses.organizationId, orgId));
      return data.error;
    }
    return "offline";
  } catch (e) {
    logger.warn("license.renew_failed", { message: (e as Error).message });
    return "offline";
  }
}

/**
 * ¿Puede operar esta cadena? En la nube siempre. En la PC: con licencia vigente de su cliente.
 * Mientras se usa, revisa con la nube cada 5 minutos en segundo plano; si estaba bloqueada o vencida,
 * vuelve a preguntar en ese momento (como mucho una vez por minuto) por si ya la reactivaron.
 */
export async function orgAllowed(orgId: string): Promise<boolean> {
  if (!isLocalMode()) return true;
  // Depende de la base en cada petición: que Next no intente prerenderizar la página al compilar.
  await connection();
  const status = await orgLicenseStatus(orgId);
  if (status === "unbound") return false;
  const lic = await db.query.orgLicenses.findFirst({ where: eq(orgLicenses.organizationId, orgId) });
  const since = lic?.lastCheckAt ? Date.now() - lic.lastCheckAt.getTime() : Infinity;
  if (status === "valid") {
    if (since > LICENSE_CHECK_EVERY_MS) {
      await db.update(orgLicenses).set({ lastCheckAt: new Date() }).where(eq(orgLicenses.organizationId, orgId));
      try {
        after(() => renewOrgLicense(orgId));
      } catch {
        void renewOrgLicense(orgId);
      }
    }
    return true;
  }
  if (since > 60 * 1000) return (await renewOrgLicense(orgId)) === "ok";
  return false;
}

export async function restaurantAllowed(restaurantId: string) {
  if (!isLocalMode()) return true;
  const r = await db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId), columns: { organizationId: true } });
  // Si el restaurante ya no existe, que responda la validación normal (404).
  return !r || (await orgAllowed(r.organizationId));
}

export async function surveyAllowed(surveyId: string) {
  if (!isLocalMode()) return true;
  const s = await db.query.surveys.findFirst({ where: eq(surveys.id, surveyId), columns: { restaurantId: true } });
  // Si la encuesta no existe, que responda la validación normal (404).
  return !s || (await restaurantAllowed(s.restaurantId));
}

// ───────────────────────── Inicio de sesión en la PC ─────────────────────────

export type LocalLoginResult = { ok: true; user: User } | { ok: false; error: string };

const MESSAGES = {
  credentials: "Correo o contraseña incorrectos. Usa la cuenta de tu negocio en Sobremesa (la misma de la web).",
  role: "Esta PC todavía no está activada para tu negocio. La primera vez debe entrar el administrador del negocio.",
  inactive: "La cuenta de tu negocio está desactivada en Sobremesa. Escríbenos para reactivarla.",
  revoked: "Esta PC fue dada de baja de tu cuenta de Sobremesa. Pide que la reactiven.",
  unbound: "Esta cuenta no tiene licencia de Sobremesa. Entra con la cuenta de tu negocio (la misma de la web).",
  expired:
    "Esta PC lleva más de 7 días sin poder conectarse a Sobremesa para renovar la licencia. Revisa el internet e intenta de nuevo.",
  offline: "No hay conexión con Sobremesa y esta cuenta todavía no ha entrado en esta PC. Revisa el internet e intenta de nuevo.",
  unavailable: "El servicio de licencias no está disponible por ahora. Intenta de nuevo en unos minutos.",
} as const;

/**
 * Valida el inicio de sesión en la PC:
 * 1. Con internet, la nube valida la cuenta y devuelve la licencia de su cliente. La cadena de ese
 *    cliente se crea en la PC si no existe y la persona queda dentro de ella, con su rol y la misma
 *    contraseña de la nube.
 * 2. Si la nube no reconoce la cuenta (p. ej. un gerente que el negocio creó en la PC) o no hay
 *    internet, vale la cuenta de la PC, pero solo si su cadena tiene licencia vigente.
 */
export async function localLogin(email: string, password: string): Promise<LocalLoginResult> {
  let cloudReason: string | null = null;
  try {
    const { status, data } = await postJson("/api/licencia/activar", {
      email,
      password,
      name: hostname(),
      deviceKey: await deviceKey(),
      version: process.env.APP_VERSION ?? null,
    });
    if (status === 200 && typeof data.license === "string") {
      const user = await bindCloudAccount(
        data as {
          license: string;
          installationId: string;
          secret?: string;
          organizationId: string;
          organizationName: string;
          user?: { name: string; role: UserRole };
        },
        email,
        password,
      );
      if (user) {
        // Que la Administración vea de una vez lo que hay en esta PC para ese cliente.
        try {
          after(() => renewOrgLicense(user.organizationId));
        } catch {
          void renewOrgLicense(user.organizationId);
        }
        return { ok: true, user };
      }
      cloudReason = "unavailable";
    } else {
      cloudReason = typeof data.error === "string" ? data.error : "unavailable";
    }
  } catch {
    cloudReason = "offline";
  }

  // La nube dijo explícitamente que ese cliente o esta PC no pueden operar: se respeta.
  if (cloudReason === "inactive" || cloudReason === "revoked") {
    const local = await db.query.users.findFirst({ where: eq(users.email, email), columns: { organizationId: true } });
    if (local) {
      await db
        .update(orgLicenses)
        .set({ token: null, block: cloudReason, updatedAt: new Date() })
        .where(eq(orgLicenses.organizationId, local.organizationId));
    }
    return { ok: false, error: MESSAGES[cloudReason] };
  }

  // Cuenta de la PC (con internet que la nube no reconoce, o sin internet).
  const local = await db.query.users.findFirst({ where: eq(users.email, email) });
  const valid = local ? await bcrypt.compare(password, local.passwordHash) : false;
  if (!local || !valid || !local.active) {
    if (cloudReason === "offline") return { ok: false, error: MESSAGES.offline };
    if (cloudReason === "role") return { ok: false, error: MESSAGES.role };
    if (cloudReason === "unavailable" || cloudReason === "rate_limited") return { ok: false, error: MESSAGES.unavailable };
    return { ok: false, error: MESSAGES.credentials };
  }
  if (!(await orgAllowed(local.organizationId))) {
    const status = await orgLicenseStatus(local.organizationId);
    return { ok: false, error: MESSAGES[status === "valid" ? "expired" : status] };
  }
  return { ok: true, user: local };
}

/** Deja en la PC la cadena del cliente de la nube, su licencia y la cuenta con la que se entró. */
async function bindCloudAccount(
  grant: {
    license: string;
    installationId: string;
    secret?: string;
    organizationId: string;
    organizationName: string;
    user?: { name: string; role: UserRole };
  },
  email: string,
  password: string,
): Promise<User | null> {
  const claims = await verifyLicense(grant.license);
  if (!claims || claims.organizationId !== grant.organizationId || claims.installationId !== grant.installationId) {
    logger.error("license.bad_grant", { organizationId: grant.organizationId });
    return null;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  return db.transaction(async (tx) => {
    let org = await tx.query.organizations.findFirst({ where: eq(organizations.cloudOrgId, grant.organizationId) });
    if (org) {
      if (org.name !== grant.organizationName) {
        [org] = await tx
          .update(organizations)
          .set({ name: grant.organizationName })
          .where(eq(organizations.id, org.id))
          .returning();
      }
    } else {
      [org] = await tx
        .insert(organizations)
        .values({ name: grant.organizationName, cloudOrgId: grant.organizationId })
        .returning();
    }

    const existingLicense = await tx.query.orgLicenses.findFirst({ where: eq(orgLicenses.organizationId, org.id) });
    const secret = grant.secret ?? existingLicense?.secret;
    if (!secret) return null;
    await tx
      .insert(orgLicenses)
      .values({
        organizationId: org.id,
        installationId: grant.installationId,
        secret,
        token: grant.license,
        lastCheckAt: new Date(),
      })
      .onConflictDoUpdate({
        target: orgLicenses.organizationId,
        set: {
          installationId: grant.installationId,
          secret,
          token: grant.license,
          block: null,
          lastCheckAt: new Date(),
          updatedAt: new Date(),
        },
      });

    const role: UserRole = grant.user?.role ?? "ADMIN";
    const name = grant.user?.name || email.split("@")[0];
    const local = await tx.query.users.findFirst({ where: eq(users.email, email) });
    if (local) {
      const [u] = await tx
        .update(users)
        .set({ organizationId: org.id, name, role, passwordHash, active: true })
        .where(eq(users.id, local.id))
        .returning();
      return u;
    }
    const [u] = await tx
      .insert(users)
      .values({ organizationId: org.id, name, email, passwordHash, role, notifyLowScores: role === "ADMIN" })
      .returning();
    return u;
  });
}
