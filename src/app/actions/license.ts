"use server";

import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
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

  const [{ count }] = await db.execute<{ count: number }>(sql`select count(*)::int as count from users`);
  if (Number(count) === 0) {
    const [org] = await db
      .insert(organizations)
      .values({ name: result.organizationName || "Mi negocio" })
      .returning({ id: organizations.id });
    const [user] = await db
      .insert(users)
      .values({
        organizationId: org.id,
        name: parsed.data.email.split("@")[0],
        email: parsed.data.email,
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
        role: "ADMIN",
        notifyLowScores: true,
      })
      .returning();
    await createSession(user);
  }
  redirect("/admin");
}

/** "Volver a revisar": pregunta otra vez a la nube (p. ej. después de que reactivaron al cliente). */
export async function retryLicenseAction() {
  if (!isLocalMode()) return;
  await renewLicense();
  redirect("/activar");
}
