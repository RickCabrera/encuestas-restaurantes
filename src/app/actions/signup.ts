"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { createSession } from "@/lib/auth";
import { registerWithInvite } from "@/lib/invites";
import { logger } from "@/lib/logger";
import { passwordSchema } from "@/lib/password-rules";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

const signupSchema = z
  .object({
    codigo: z.string(),
    name: z.string().trim().min(2, "Escribe tu nombre").max(80, "Máximo 80 caracteres"),
    email: z.email("Escribe un correo válido").transform((v) => v.toLowerCase().trim()),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" });

/** Registro con enlace de invitación de un solo uso (no hay registro público). */
export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  try {
    return await signupActionInner(formData, values);
  } catch (e) {
    // redirect() de Next se implementa lanzando un error: se deja pasar.
    unstable_rethrow(e);
    logger.error("auth.signup_error", { message: (e as Error).message });
    return { error: "No pudimos conectar con el servidor. Intenta de nuevo en un momento.", values };
  }
}

async function signupActionInner(formData: FormData, values: Record<string, string>): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    codigo: String(formData.get("codigo") ?? ""),
    name: values.name,
    email: values.email.trim(),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const d = parsed.data;

  const ip = await clientIp();
  const limited = await rateLimit(`signup:ip:${ip}`, 10, 15 * 60);
  if (!limited.ok) {
    return { error: `Demasiados intentos. Intenta de nuevo en ${Math.ceil(limited.retryAfterSec / 60)} min.`, values };
  }

  const result = await registerWithInvite({ token: d.codigo, name: d.name, email: d.email, password: d.password });
  if (!result.ok) {
    if (result.reason === "email") return { fieldErrors: { email: ["Ya existe una cuenta con ese correo"] }, values };
    logger.warn("auth.signup_invalid_invite", { ip });
    // La página vuelve a validar el código y muestra el aviso en lugar del formulario.
    redirect(`/registro?codigo=${encodeURIComponent(d.codigo)}`);
  }

  await createSession(result.user);
  logger.info("auth.signup", { userId: result.user.id, role: result.user.role });
  redirect("/admin");
}
