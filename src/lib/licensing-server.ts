import "server-only";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { installations, organizations, users } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { signLicense } from "./license-token";

/**
 * Lado nube de las licencias de las instalaciones en PC (ver src/lib/license-token.ts).
 * Rechazos: "credentials" (correo o contraseña), "role" (no es administrador del negocio),
 * "inactive" (el cliente está desactivado en la Administración), "revoked" (la instalación se revocó).
 */
export type LicenseFailure = "credentials" | "role" | "inactive" | "revoked";
export type LicenseResult =
  | { ok: true; installationId: string; secret?: string; license: string; organizationName: string }
  | { ok: false; reason: LicenseFailure };

const DUMMY_HASH = bcrypt.hashSync("contraseña-ficticia", 10);

/** Activa una PC con la cuenta de administrador del negocio en la nube. */
export async function activateInstallation(input: {
  email: string;
  password: string;
  name: string;
  version?: string | null;
}): Promise<LicenseResult> {
  const email = input.email.toLowerCase().trim();
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.active) return { ok: false, reason: "credentials" };
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) });
  if (!org || org.internal) return { ok: false, reason: "role" };
  if (user.role !== "ADMIN") return { ok: false, reason: "role" };
  if (!org.active) return { ok: false, reason: "inactive" };

  const secret = randomToken(32);
  const [row] = await db
    .insert(installations)
    .values({
      organizationId: org.id,
      name: input.name.trim().slice(0, 80) || "PC",
      secretHash: sha256(secret),
      appVersion: input.version?.slice(0, 30) || null,
      activatedByEmail: email,
    })
    .returning({ id: installations.id });
  const license = await signLicense({ installationId: row.id, organizationId: org.id, organizationName: org.name });
  return { ok: true, installationId: row.id, secret, license, organizationName: org.name };
}

/** Renueva la licencia de una PC ya activada, si su cliente sigue activo y no se revocó. */
export async function renewInstallation(input: {
  installationId: string;
  secret: string;
  version?: string | null;
}): Promise<LicenseResult> {
  const row = await db.query.installations.findFirst({
    where: and(eq(installations.id, input.installationId), eq(installations.secretHash, sha256(input.secret))),
    with: { organization: true },
  });
  if (!row) return { ok: false, reason: "revoked" };
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  await db
    .update(installations)
    .set({ lastSeenAt: new Date(), ...(input.version ? { appVersion: input.version.slice(0, 30) } : {}) })
    .where(eq(installations.id, row.id));
  if (!row.organization.active) return { ok: false, reason: "inactive" };
  const license = await signLicense({
    installationId: row.id,
    organizationId: row.organization.id,
    organizationName: row.organization.name,
  });
  return { ok: true, installationId: row.id, license, organizationName: row.organization.name };
}
