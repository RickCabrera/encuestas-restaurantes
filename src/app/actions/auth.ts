"use server";

import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { escapeHtml, sendEmail } from "@/lib/email";
import { RESTAURANT_COOKIE } from "@/lib/filters";
import { logger } from "@/lib/logger";
import { passwordSchema } from "@/lib/password-rules";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { appUrl, clientIp } from "@/lib/request";

// Hash ficticio para comparar en tiempo constante cuando el correo no existe.
const DUMMY_HASH = bcrypt.hashSync("contraseña-ficticia", 10);

// Rutas solo para administradores: si un gerente inicia sesión con ?next= a una de estas, va al resumen.
const ADMIN_ONLY_PATHS = ["/admin/restaurants", "/admin/devices", "/admin/users", "/admin/surveys/new"];

const loginSchema = z.object({
  email: z.email("Escribe un correo válido").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Escribe tu contraseña"),
});

export async function loginAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return await loginActionInner(prev, formData);
  } catch (e) {
    // redirect() de Next se implementa lanzando un error: se deja pasar.
    unstable_rethrow(e);
    logger.error("auth.login_error", { message: (e as Error).message });
    return {
      error: "No pudimos conectar con el servidor. Intenta de nuevo en un momento.",
      values: { email: String(formData.get("email") ?? "") },
    };
  }
}

async function loginActionInner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rawEmail = String(formData.get("email") ?? "");
  const values = { email: rawEmail };
  const parsed = loginSchema.safeParse({ email: rawEmail, password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const { email, password } = parsed.data;

  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 20, 15 * 60),
    rateLimit(`login:email:${email}`, 8, 15 * 60),
  ]);
  if (!byIp.ok || !byEmail.ok) {
    const mins = Math.ceil(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec) / 60);
    return { error: `Demasiados intentos. Intenta de nuevo en ${mins} min.`, values };
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.active) {
    logger.warn("auth.login_failed", { email, ip });
    return { error: "Correo o contraseña incorrectos.", values };
  }

  await resetRateLimit(`login:email:${email}`);
  await createSession(user);
  logger.info("auth.login", { userId: user.id });
  const next = String(formData.get("next") ?? "");
  // Solo rutas internas del panel (evita redirecciones abiertas a otros sitios).
  const adminOnly = ADMIN_ONLY_PATHS.some((p) => next.startsWith(p));
  const allowed = next.startsWith("/admin") && !next.startsWith("//") && (user.role === "ADMIN" || !adminOnly);
  redirect(allowed ? next : "/admin");
}

export async function logoutAction() {
  await destroySession();
  // El restaurante elegido en el selector es de la sesión: no debe pasar a la siguiente persona.
  (await cookies()).delete(RESTAURANT_COOKIE);
  redirect("/login");
}

const changeSchema = z
  .object({
    current: z.string().min(1, "Escribe tu contraseña actual"),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" });

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireUser();
  const parsed = changeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const user = await db.query.users.findFirst({ where: eq(users.id, session.id) });
  if (!user || !(await bcrypt.compare(parsed.data.current, user.passwordHash))) {
    return { fieldErrors: { current: ["La contraseña actual no es correcta"] } };
  }
  const [updated] = await db
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, user.id))
    .returning();
  // Cierra las demás sesiones y renueva la actual.
  await createSession(updated);
  return { ok: true, message: "Contraseña actualizada. Se cerraron tus otras sesiones." };
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.email().safeParse(
    String(formData.get("email") ?? "")
      .toLowerCase()
      .trim(),
  );
  if (!parsed.success) return { fieldErrors: { email: ["Escribe un correo válido"] } };
  const email = parsed.data;
  const ip = await clientIp();
  const limited = await rateLimit(`forgot:${ip}`, 5, 15 * 60);
  const generic: ActionState = {
    ok: true,
    message: "Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña. Vence en 1 hora.",
  };
  if (!limited.ok) return generic;

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (user && user.active) {
    const token = randomToken();
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const link = `${await appUrl()}/reset-password/${token}`;
    await sendEmail({
      to: [user.email],
      subject: "Crea una nueva contraseña",
      text: `Hola ${user.name},\n\nPara crear una nueva contraseña abre este enlace (vence en 1 hora):\n${link}\n\nSi no lo pediste, ignora este correo.`,
      html: `<p>Hola ${escapeHtml(user.name)},</p><p>Para crear una nueva contraseña abre este enlace (vence en 1 hora):</p><p><a href="${link}">${link}</a></p><p>Si no lo pediste, ignora este correo.</p>`,
    });
  }
  return generic;
}

const resetSchema = z
  .object({ token: z.string().min(10), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" });

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const row = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, sha256(parsed.data.token)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    ),
  });
  if (!row) return { error: "El enlace ya no es válido. Pide uno nuevo." };
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.transaction(async (tx) => {
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
    await tx
      .update(users)
      .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, row.userId));
  });
  redirect("/login?reset=1");
}
