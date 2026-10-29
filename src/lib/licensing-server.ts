import "server-only";
import bcrypt from "bcryptjs";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { installations, organizations, users, type InstallationStats, type UserRole } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { signLicense } from "./license-token";

/**
 * Lado nube de las licencias de las instalaciones en PC (ver src/lib/license-token.ts).
 * Rechazos: "credentials" (correo o contraseña), "role" (un gerente no puede activar una PC nueva),
 * "inactive" (el cliente está desactivado en la Administración), "revoked" (esa PC se dio de baja).
 */
export type LicenseFailure = "credentials" | "role" | "inactive" | "revoked";

export type LicenseGrant = {
  ok: true;
  installationId: string;
  /** Solo viene cuando se creó la instalación: la PC lo guarda para renovar. */
  secret?: string;
  license: string;
  organizationId: string;
  organizationName: string;
  user?: { name: string; email: string; role: UserRole };
};
export type LicenseResult = LicenseGrant | { ok: false; reason: LicenseFailure };

const DUMMY_HASH = bcrypt.hashSync("contraseña-ficticia", 10);

/**
 * Inicio de sesión en una PC con una cuenta de la nube. Devuelve la licencia del cliente de esa
 * cuenta para esa PC (identificada por su llave), creando la instalación la primera vez.
 * - Un administrador puede activar una PC nueva; un gerente solo entra a una PC ya activada.
 * - Una PC dada de baja no se vuelve a activar sola: hay que reactivarla en la Administración.
 */
export async function activateInstallation(input: {
  email: string;
  password: string;
  name: string;
  deviceKey?: string | null;
  version?: string | null;
  stats?: InstallationStats | null;
}): Promise<LicenseResult> {
  const email = input.email.toLowerCase().trim();
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.active) return { ok: false, reason: "credentials" };
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) });
  if (!org || org.internal) return { ok: false, reason: "role" };
  if (!org.active) return { ok: false, reason: "inactive" };

  const deviceKeyHash = input.deviceKey ? sha256(`device:${input.deviceKey}`) : null;
  const previous = deviceKeyHash
    ? await db.query.installations.findFirst({
        where: and(eq(installations.organizationId, org.id), eq(installations.deviceKeyHash, deviceKeyHash)),
        orderBy: desc(installations.createdAt),
      })
    : undefined;
  if (previous?.revokedAt) return { ok: false, reason: "revoked" };

  const who = { name: user.name, email: user.email, role: user.role };
  const base = { organizationId: org.id, organizationName: org.name, user: who };

  if (previous) {
    await db
      .update(installations)
      .set({
        lastSeenAt: new Date(),
        name: input.name.trim().slice(0, 80) || previous.name,
        ...(input.version ? { appVersion: input.version.slice(0, 30) } : {}),
        ...(input.stats ? { stats: input.stats } : {}),
      })
      .where(eq(installations.id, previous.id));
    // La PC ya tenía su secreto; se le manda uno nuevo por si lo perdió (p. ej. reinstalación).
    const secret = randomToken(32);
    await db
      .update(installations)
      .set({ secretHash: sha256(secret) })
      .where(eq(installations.id, previous.id));
    const license = await signLicense({ installationId: previous.id, organizationId: org.id, organizationName: org.name });
    return { ok: true, installationId: previous.id, secret, license, ...base };
  }

  if (user.role !== "ADMIN") return { ok: false, reason: "role" };
  const secret = randomToken(32);
  const [row] = await db
    .insert(installations)
    .values({
      organizationId: org.id,
      name: input.name.trim().slice(0, 80) || "PC",
      secretHash: sha256(secret),
      deviceKeyHash,
      appVersion: input.version?.slice(0, 30) || null,
      activatedByEmail: email,
      stats: input.stats ?? null,
    })
    .returning({ id: installations.id });
  const license = await signLicense({ installationId: row.id, organizationId: org.id, organizationName: org.name });
  return { ok: true, installationId: row.id, secret, license, ...base };
}

/** Renueva la licencia de una PC ya activada, si su cliente sigue activo y no se dio de baja. */
export async function renewInstallation(input: {
  installationId: string;
  secret: string;
  version?: string | null;
  stats?: InstallationStats | null;
}): Promise<LicenseResult> {
  const row = await db.query.installations.findFirst({
    where: and(eq(installations.id, input.installationId), eq(installations.secretHash, sha256(input.secret))),
    with: { organization: true },
  });
  if (!row || row.revokedAt) return { ok: false, reason: "revoked" };
  await db
    .update(installations)
    .set({
      lastSeenAt: new Date(),
      ...(input.version ? { appVersion: input.version.slice(0, 30) } : {}),
      ...(input.stats ? { stats: input.stats } : {}),
    })
    .where(eq(installations.id, row.id));
  if (!row.organization.active) return { ok: false, reason: "inactive" };
  const license = await signLicense({
    installationId: row.id,
    organizationId: row.organization.id,
    organizationName: row.organization.name,
  });
  return {
    ok: true,
    installationId: row.id,
    license,
    organizationId: row.organization.id,
    organizationName: row.organization.name,
  };
}
