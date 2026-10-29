"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { demoRequests, installations, organizations, payments, users } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { requirePlatformAdmin } from "@/lib/auth";
import { BILLING_DAY_MAX, BILLING_DAY_MIN, isValidPeriod, parseMoney } from "@/lib/billing";
import { formatDateTime, isValidDay } from "@/lib/dates";
import { escapeHtml, sendEmail } from "@/lib/email";
import { isUuid } from "@/lib/ids";
import { createInvite, createOrgInvite, inviteLink } from "@/lib/invites";
import { logger } from "@/lib/logger";
import { deleteOrganization, isProtectedOrgName } from "@/lib/orgs";
import { passwordSchema } from "@/lib/password-rules";
import { countActivePlatformAdmins, getOrCreateInternalOrg } from "@/lib/platform";
import { appUrl } from "@/lib/request";
import { setAccent } from "@/lib/settings";
import { ACCENT_PRESETS } from "@/lib/ui-theme";

export type LinkState = ActionState & { link?: string; expiresLabel?: string; emailed?: boolean };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => v || null);

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.email().safeParse(v).success, "Correo inválido")
  .transform((v) => v || null);

/** Cliente (cadena) que se puede administrar: existe y no es la cadena interna del equipo. */
async function clientOrg(id: string) {
  if (!isUuid(id)) return undefined;
  return db.query.organizations.findFirst({ where: and(eq(organizations.id, id), eq(organizations.internal, false)) });
}

function revalidateClients(id?: string) {
  revalidatePath("/plataforma/clientes");
  revalidatePath("/plataforma/pagos");
  if (id) {
    revalidatePath(`/plataforma/clientes/${id}`);
    revalidatePath(`/plataforma/pagos/${id}`);
  }
}

// ───────────────────────── Clientes ─────────────────────────

/** Enlace de un solo uso para que un negocio nuevo cree su cadena y su cuenta de administrador. */
export async function createClientInviteAction(_prev: LinkState, fd: FormData): Promise<LinkState> {
  const me = await requirePlatformAdmin();
  const parsed = z
    .object({ email: optionalEmail, contactName: optionalText(80), requestId: z.string() })
    .safeParse({ email: fd.get("email") ?? "", contactName: fd.get("contactName") ?? "", requestId: fd.get("requestId") ?? "" });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { email, contactName, requestId } = parsed.data;

  const { token, expiresAt } = await createOrgInvite();
  const link = inviteLink(await appUrl(), token);
  let emailed = false;
  if (email && fd.get("send") === "on") {
    const hello = contactName ? `Hola ${contactName},` : "Hola,";
    await sendEmail({
      to: [email],
      subject: "Tu acceso a Sobremesa",
      text: `${hello}\n\nCon este enlace das de alta tu negocio en Sobremesa y creas tu cuenta de administrador (vence en 7 días y sirve una sola vez):\n${link}\n\nCualquier duda, responde este correo.`,
      html: `<p>${escapeHtml(hello)}</p><p>Con este enlace das de alta tu negocio en Sobremesa y creas tu cuenta de administrador. Vence en 7 días y sirve una sola vez.</p><p><a href="${link}">Crear mi cuenta</a></p><p style="color:#666;font-size:13px">${link}</p>`,
    });
    emailed = true;
  }
  if (isUuid(requestId)) {
    await db.update(demoRequests).set({ status: "CONVERTED", updatedAt: new Date() }).where(eq(demoRequests.id, requestId));
    revalidatePath("/plataforma/solicitudes");
  }
  logger.info("platform.client_invite", { by: me.id, emailed });
  return { link, expiresLabel: formatDateTime(expiresAt), emailed };
}

/** Enlace para un administrador más dentro de un cliente que ya existe. */
export async function createClientAdminInviteAction(orgId: string): Promise<LinkState> {
  const me = await requirePlatformAdmin();
  const org = await clientOrg(orgId);
  if (!org) return { error: "Cliente no encontrado." };
  const { token, expiresAt } = await createInvite({ organizationId: org.id, role: "ADMIN" });
  logger.info("platform.client_admin_invite", { by: me.id, organizationId: org.id });
  return { link: inviteLink(await appUrl(), token), expiresLabel: formatDateTime(expiresAt) };
}

export async function setClientActiveAction(orgId: string, active: boolean) {
  const me = await requirePlatformAdmin();
  const org = await clientOrg(orgId);
  if (!org) return;
  await db.update(organizations).set({ active }).where(eq(organizations.id, org.id));
  logger.info(active ? "platform.client_reactivated" : "platform.client_deactivated", { by: me.id, organizationId: org.id });
  revalidateClients(org.id);
}

export async function updateClientAction(orgId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const org = await clientOrg(orgId);
  if (!org) return { error: "Cliente no encontrado." };
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80, "Máximo 80 caracteres"),
      contactName: optionalText(80),
      contactEmail: optionalEmail,
      contactPhone: optionalText(30),
      notes: optionalText(2000),
    })
    .safeParse(
      Object.fromEntries(["name", "contactName", "contactEmail", "contactPhone", "notes"].map((k) => [k, fd.get(k) ?? ""])),
    );
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  if (isProtectedOrgName(parsed.data.name) && !isProtectedOrgName(org.name)) {
    return { fieldErrors: { name: ["Ese nombre está reservado"] } };
  }
  await db.update(organizations).set(parsed.data).where(eq(organizations.id, org.id));
  revalidateClients(org.id);
  return { ok: true, message: "Datos guardados." };
}

/** Borra un cliente con todo lo suyo. Pide escribir el nombre exacto; "Demo" nunca se borra. */
export async function deleteClientAction(orgId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requirePlatformAdmin();
  const org = await clientOrg(orgId);
  if (!org) return { error: "Cliente no encontrado." };
  if (isProtectedOrgName(org.name)) return { error: "La cadena Demo no se puede borrar." };
  if (String(fd.get("confirm") ?? "").trim() !== org.name) {
    return { fieldErrors: { confirm: ["Escribe el nombre exacto del cliente"] } };
  }
  const result = await deleteOrganization(org.id);
  logger.warn("platform.client_deleted", { by: me.id, organizationId: org.id, counts: result?.counts });
  revalidateClients();
  redirect("/plataforma/clientes?borrado=1");
}

/** Dar de baja una instalación en PC: deja de renovar su licencia y se bloquea en su siguiente revisión. */
export async function revokeInstallationAction(installationId: string) {
  const me = await requirePlatformAdmin();
  if (!isUuid(installationId)) return;
  const [row] = await db
    .update(installations)
    .set({ revokedAt: new Date(), revokedByName: me.name })
    .where(eq(installations.id, installationId))
    .returning({ organizationId: installations.organizationId });
  if (row) {
    logger.warn("platform.installation_revoked", { by: me.id, installationId });
    revalidateClients(row.organizationId);
  }
}

// ───────────────────────── Solicitudes ─────────────────────────

export async function updateDemoRequestAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  if (!isUuid(id)) return { error: "Solicitud no encontrada." };
  const parsed = z
    .object({ status: z.enum(["NEW", "CONTACTED", "CONVERTED", "DISCARDED"]), notes: optionalText(2000) })
    .safeParse({ status: fd.get("status"), notes: fd.get("notes") ?? "" });
  if (!parsed.success) return { error: "Revisa los datos." };
  await db
    .update(demoRequests)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(demoRequests.id, id));
  revalidatePath("/plataforma/solicitudes");
  return { ok: true, message: "Guardado." };
}

export async function deleteDemoRequestAction(id: string) {
  await requirePlatformAdmin();
  if (!isUuid(id)) return;
  await db.delete(demoRequests).where(eq(demoRequests.id, id));
  revalidatePath("/plataforma/solicitudes");
}

// ───────────────────────── Pagos ─────────────────────────

export async function setBillingDayAction(orgId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const org = await clientOrg(orgId);
  if (!org) return { error: "Cliente no encontrado." };
  const day = Number(fd.get("billingDay"));
  if (!Number.isInteger(day) || day < BILLING_DAY_MIN || day > BILLING_DAY_MAX) {
    return { fieldErrors: { billingDay: [`Del ${BILLING_DAY_MIN} al ${BILLING_DAY_MAX}`] } };
  }
  await db.update(organizations).set({ billingDay: day }).where(eq(organizations.id, org.id));
  revalidateClients(org.id);
  return { ok: true, message: "Día de corte guardado." };
}

export async function registerPaymentAction(orgId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requirePlatformAdmin();
  const org = await clientOrg(orgId);
  if (!org) return { error: "Cliente no encontrado." };
  const values = Object.fromEntries(["period", "amount", "method", "paidOn", "notes"].map((k) => [k, String(fd.get(k) ?? "")]));
  const fieldErrors: Record<string, string[]> = {};
  if (!isValidPeriod(values.period)) fieldErrors.period = ["Elige el mes"];
  const amountCents = parseMoney(values.amount);
  if (amountCents === null) fieldErrors.amount = ["Escribe un monto válido, p. ej. 999 o 1,250.50"];
  const method = z.enum(["TRANSFER", "CASH", "CARD", "OTHER"]).safeParse(values.method);
  if (!method.success) fieldErrors.method = ["Elige cómo se pagó"];
  if (!isValidDay(values.paidOn)) fieldErrors.paidOn = ["Elige la fecha"];
  if (values.notes.length > 500) fieldErrors.notes = ["Máximo 500 caracteres"];
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  await db.insert(payments).values({
    organizationId: org.id,
    period: values.period,
    amountCents: amountCents!,
    method: method.data!,
    paidOn: values.paidOn,
    notes: values.notes.trim() || null,
    recordedById: me.id,
    recordedByName: me.name,
  });
  logger.info("platform.payment_registered", { by: me.id, organizationId: org.id, period: values.period });
  revalidateClients(org.id);
  return { ok: true, message: "Pago registrado." };
}

export async function voidPaymentAction(paymentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requirePlatformAdmin();
  if (!isUuid(paymentId)) return { error: "Pago no encontrado." };
  const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 3) return { fieldErrors: { reason: ["Escribe el motivo"] } };
  if (reason.length > 300) return { fieldErrors: { reason: ["Máximo 300 caracteres"] } };
  const [p] = await db
    .update(payments)
    .set({ voidedAt: new Date(), voidedByName: me.name, voidReason: reason })
    .where(eq(payments.id, paymentId))
    .returning({ organizationId: payments.organizationId });
  if (!p) return { error: "Pago no encontrado." };
  logger.info("platform.payment_voided", { by: me.id, paymentId });
  revalidateClients(p.organizationId);
  return { ok: true };
}

export async function restorePaymentAction(paymentId: string) {
  const me = await requirePlatformAdmin();
  if (!isUuid(paymentId)) return;
  const [p] = await db
    .update(payments)
    .set({ voidedAt: null, voidedByName: null, voidReason: null })
    .where(eq(payments.id, paymentId))
    .returning({ organizationId: payments.organizationId });
  if (p) {
    logger.info("platform.payment_restored", { by: me.id, paymentId });
    revalidateClients(p.organizationId);
  }
}

// ───────────────────────── Conexiones ─────────────────────────

export async function sendTestEmailAction(): Promise<ActionState> {
  const me = await requirePlatformAdmin();
  if (!process.env.RESEND_API_KEY) {
    return { error: "Falta RESEND_API_KEY: sin ella los correos solo se escriben en el log del servidor." };
  }
  await sendEmail({
    to: [me.email],
    subject: "Correo de prueba de Sobremesa",
    text: `Hola ${me.name},\n\nSi lees esto, el correo saliente de Sobremesa funciona.\n\n${await appUrl()}`,
    html: `<p>Hola ${escapeHtml(me.name)},</p><p>Si lees esto, el correo saliente de Sobremesa funciona.</p>`,
  });
  return {
    ok: true,
    message: `Enviado a ${me.email}. Si no llega en un par de minutos, revisa el log del servidor (email.failed).`,
  };
}

export async function testDatabaseAction(): Promise<ActionState> {
  await requirePlatformAdmin();
  const started = performance.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, message: `Respondió en ${Math.round(performance.now() - started)} ms.` };
  } catch (e) {
    return { error: `No respondió: ${(e as Error).message}` };
  }
}

// ───────────────────────── Ajustes ─────────────────────────

export async function setAccentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requirePlatformAdmin();
  const id = String(fd.get("accent") ?? "");
  if (!ACCENT_PRESETS.some((p) => p.id === id)) return { error: "Elige un color de la lista." };
  await setAccent(id);
  logger.info("platform.accent_changed", { by: me.id, accent: id });
  revalidatePath("/", "layout");
  return { ok: true, message: "Color guardado." };
}

// ───────────────────────── Administradores ─────────────────────────

const adminSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(80, "Máximo 80 caracteres"),
  email: z.email("Correo inválido").transform((v) => v.toLowerCase().trim()),
});

export async function createPlatformAdminAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requirePlatformAdmin();
  const values = { name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? "") };
  const parsed = adminSchema.safeParse(values);
  const pw = passwordSchema.safeParse(String(fd.get("password") ?? ""));
  if (!parsed.success || !pw.success) {
    return {
      fieldErrors: {
        ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors),
        ...(pw.success ? {} : { password: pw.error.issues.map((i) => i.message) }),
      },
      values,
    };
  }
  const exists = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email), columns: { id: true } });
  if (exists) {
    return {
      fieldErrors: { email: ["Ya hay una cuenta con ese correo. Búscala abajo, en «Convertir una cuenta de cliente»."] },
      values,
    };
  }
  const org = await getOrCreateInternalOrg();
  await db.insert(users).values({
    organizationId: org.id,
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: await bcrypt.hash(pw.data, 10),
    role: "ADMIN",
    platformAdmin: true,
  });
  logger.info("platform.admin_created", { by: me.id, email: parsed.data.email });
  revalidatePath("/plataforma/administradores");
  return { ok: true, message: `${parsed.data.name} ya puede entrar con su correo y la contraseña que le pusiste.` };
}

/** Editar nombre, correo y (opcional) contraseña de una cuenta del equipo. Las cuentas de cliente se editan en su panel. */
export async function updatePlatformAdminAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requirePlatformAdmin();
  if (!isUuid(id)) return { error: "Administrador no encontrado." };
  const target = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.platformAdmin, true)),
    with: { organization: { columns: { internal: true } } },
  });
  if (!target) return { error: "Administrador no encontrado." };
  const values = { name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? "") };
  const parsed = adminSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const password = String(fd.get("password") ?? "");
  const pw = password ? passwordSchema.safeParse(password) : null;
  if (pw && !pw.success) return { fieldErrors: { password: pw.error.issues.map((i) => i.message) }, values };
  const clash = await db.query.users.findFirst({
    where: and(eq(users.email, parsed.data.email), ne(users.id, id)),
    columns: { id: true },
  });
  if (clash) return { fieldErrors: { email: ["Ya hay otra cuenta con ese correo"] }, values };

  await db
    .update(users)
    .set({
      name: parsed.data.name,
      email: parsed.data.email,
      ...(pw?.success ? { passwordHash: await bcrypt.hash(pw.data, 10), sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
    })
    .where(eq(users.id, id));
  logger.info("platform.admin_updated", { by: me.id, id, passwordChanged: !!pw });
  revalidatePath("/plataforma/administradores");
  // Si cambió su propia contraseña, su sesión se invalidó: que vuelva a entrar.
  if (id === me.id && pw?.success) redirect("/login");
  return { ok: true, message: "Cambios guardados." };
}

async function keepsOneAdmin(targetId: string) {
  const target = await db.query.users.findFirst({
    where: eq(users.id, targetId),
    columns: { active: true, platformAdmin: true },
  });
  if (!target?.active || !target.platformAdmin) return true;
  return (await countActivePlatformAdmins()) > 1;
}

/** Desactivar o reactivar una cuenta del equipo (cadena interna). */
export async function setPlatformAdminActiveAction(id: string, active: boolean) {
  const me = await requirePlatformAdmin();
  if (!isUuid(id) || id === me.id) return;
  if (!active && !(await keepsOneAdmin(id))) return;
  const internal = await getOrCreateInternalOrg();
  await db
    .update(users)
    .set({ active, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(and(eq(users.id, id), eq(users.platformAdmin, true), eq(users.organizationId, internal.id)));
  logger.info(active ? "platform.admin_reactivated" : "platform.admin_deactivated", { by: me.id, id });
  revalidatePath("/plataforma/administradores");
}

/** Quitarle la Administración a una cuenta de cliente convertida (sigue entrando a su negocio). */
export async function revokePlatformAdminAction(id: string) {
  const me = await requirePlatformAdmin();
  if (!isUuid(id) || id === me.id) return;
  if (!(await keepsOneAdmin(id))) return;
  await db.update(users).set({ platformAdmin: false }).where(eq(users.id, id));
  logger.info("platform.admin_revoked", { by: me.id, id });
  revalidatePath("/plataforma/administradores");
}

/** Convertir una cuenta de cliente en administrador sin cambiarle correo ni contraseña. */
export async function grantPlatformAdminAction(id: string) {
  const me = await requirePlatformAdmin();
  if (!isUuid(id)) return;
  await db
    .update(users)
    .set({ platformAdmin: true })
    .where(and(eq(users.id, id), eq(users.active, true)));
  logger.info("platform.admin_granted", { by: me.id, id });
  revalidatePath("/plataforma/administradores");
  redirect("/plataforma/administradores?convertido=1");
}
