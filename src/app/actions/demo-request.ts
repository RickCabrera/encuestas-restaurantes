"use server";

import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { demoRequests, users } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { isLocalMode } from "@/lib/app-mode";
import { escapeHtml, sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { appUrl, clientIp } from "@/lib/request";

const FIELDS = ["name", "business", "email", "phone", "city", "branches", "message"] as const;

const schema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(80, "Máximo 80 caracteres"),
  business: z.string().trim().min(2, "Escribe el nombre de tu restaurante").max(100, "Máximo 100 caracteres"),
  email: z.email("Escribe un correo válido").transform((v) => v.toLowerCase().trim()),
  phone: z
    .string()
    .trim()
    .max(30, "Máximo 30 caracteres")
    .refine((v) => v === "" || v.replace(/\D/g, "").length >= 10, "Escribe un teléfono de 10 dígitos"),
  city: z.string().trim().max(80, "Máximo 80 caracteres"),
  branches: z.enum(["", "1", "2-5", "6-10", "11+"]),
  message: z.string().trim().max(1500, "Máximo 1500 caracteres"),
});

/** Formulario "Pedir demo" de la página de inicio. Crea una solicitud y avisa a los administradores. */
export async function createDemoRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (isLocalMode()) return { error: "No disponible en esta instalación." };
  const values = Object.fromEntries(FIELDS.map((k) => [k, String(fd.get(k) ?? "")]));
  // Honeypot: un campo oculto que solo llenan los bots. Se responde como si todo hubiera salido bien.
  if (String(fd.get("website") ?? "").trim()) return { ok: true };

  const parsed = schema.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const ip = await clientIp();
  const limited = await rateLimit(`demo:ip:${ip}`, 5, 60 * 60);
  if (!limited.ok) return { error: "Recibimos varias solicitudes desde tu conexión. Intenta más tarde o escríbenos.", values };

  const d = parsed.data;
  const [row] = await db
    .insert(demoRequests)
    .values({
      name: d.name,
      business: d.business,
      email: d.email,
      phone: d.phone || null,
      city: d.city || null,
      branches: d.branches || null,
      message: d.message || null,
    })
    .returning({ id: demoRequests.id });
  logger.info("demo_request.created", { id: row.id });

  const base = await appUrl();
  after(async () => {
    const admins = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.platformAdmin, true), eq(users.active, true)));
    if (admins.length === 0) return;
    const lines = [
      `Restaurante: ${d.business}`,
      `Nombre: ${d.name}`,
      `Correo: ${d.email}`,
      d.phone ? `Teléfono: ${d.phone}` : null,
      d.city ? `Ciudad: ${d.city}` : null,
      d.branches ? `Sucursales: ${d.branches}` : null,
      d.message ? `\n${d.message}` : null,
    ].filter(Boolean) as string[];
    await sendEmail({
      to: admins.map((a) => a.email),
      subject: `Nueva solicitud de demo: ${d.business}`,
      text: `${lines.join("\n")}\n\nVer solicitudes: ${base}/plataforma/solicitudes`,
      html: `<p>Llegó una solicitud de demo desde la página de inicio.</p><p>${lines.map((l) => escapeHtml(l).replace(/\n/g, "<br>")).join("<br>")}</p><p><a href="${base}/plataforma/solicitudes">Ver solicitudes</a></p>`,
    });
  });

  return { ok: true, message: "¡Gracias! Te contactamos en menos de un día hábil para agendar tu demo." };
}
