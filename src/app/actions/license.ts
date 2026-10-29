"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { isLocalMode } from "@/lib/app-mode";
import { createSession } from "@/lib/auth";
import { activateLicense, renewLicense } from "@/lib/license-local";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

const schema = z.object({
  email: z.email("Escribe un correo válido").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Escribe tu contraseña"),
});

/**
 * Activa la licencia de esta PC con la cuenta del negocio en la nube. Si la PC todavía no tiene
 * usuarios (instalación nueva), crea aquí la cadena y su administrador con esa misma cuenta.
 */
export async function activateLicenseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!isLocalMode()) return { error: "Solo aplica a la versión instalada en PC." };
  const values = { email: String(fd.get("email") ?? "") };
  const parsed = schema.safeParse({ email: values.email, password: fd.get("password") });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const limited = await rateLimit(`license:local:${await clientIp()}`, 10, 15 * 60);
  if (!limited.ok) return { error: "Demasiados intentos. Espera unos minutos.", values };

  const result = await activateLicense(parsed.data.email, parsed.data.password);
  if (!result.ok) return { error: result.error, values };
  logger.info("license.local_activated", { organization: result.organizationName });

  // La cuenta con la que se activó siempre puede entrar a esta PC, con la misma contraseña que en la nube.
  const user = await ensureLocalAdmin(parsed.data.email, parsed.data.password, result.organizationName);
  await createSession(user);
  redirect("/admin");
}

/**
 * Deja en esta PC una cuenta de administrador con el correo y la contraseña de la nube:
 * - si el correo ya existe aquí, le pone esa contraseña y la activa como administrador;
 * - si la PC no tiene cadenas, crea la cadena con el nombre del cliente;
 * - si ya tiene, entra a la que tiene más restaurantes (la del negocio que ya se usaba aquí).
 */
async function ensureLocalAdmin(email: string, password: string, orgName: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    const [u] = await db
      .update(users)
      .set({ passwordHash, role: "ADMIN", active: true, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, existing.id))
      .returning();
    return u;
  }
  const [main] = await db.execute<{ id: string }>(sql`
    select o.id from organizations o
    order by (select count(*) from restaurants r where r.organization_id = o.id) desc, o.created_at asc
    limit 1
  `);
  const organizationId =
    main?.id ??
    (
      await db
        .insert(organizations)
        .values({ name: orgName || "Mi negocio" })
        .returning({ id: organizations.id })
    )[0].id;
  const [u] = await db
    .insert(users)
    .values({ organizationId, name: email.split("@")[0], email, passwordHash, role: "ADMIN", notifyLowScores: true })
    .returning();
  return u;
}

/** "Volver a revisar": pregunta otra vez a la nube (p. ej. después de que reactivaron al cliente). */
export async function retryLicenseAction() {
  if (!isLocalMode()) return;
  await renewLicense();
  redirect("/activar");
}
