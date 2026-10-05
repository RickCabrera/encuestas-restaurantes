"use server";

import { and, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { devices } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth";
import { sixDigitCode } from "@/lib/crypto";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";

const PAIRING_MINUTES = 15;

async function uniqueCode() {
  for (let i = 0; i < 10; i++) {
    const code = sixDigitCode();
    const clash = await db.query.devices.findFirst({
      where: and(eq(devices.pairingCode, code), gt(devices.pairingExpiresAt, new Date())),
      columns: { id: true },
    });
    if (!clash) return code;
  }
  throw new Error("No se pudo generar un código único");
}

export type PairingState = ActionState & { code?: string; expiresAt?: string; deviceName?: string };

const createSchema = z.object({
  name: z.string().trim().min(2, "Escribe un nombre").max(60),
  restaurantId: z.string().refine(isUuid, "Elige un restaurante"),
});

export async function createDeviceAction(_prev: PairingState, fd: FormData): Promise<PairingState> {
  await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const code = await uniqueCode();
  const expiresAt = new Date(Date.now() + PAIRING_MINUTES * 60 * 1000);
  await db.insert(devices).values({ ...parsed.data, pairingCode: code, pairingExpiresAt: expiresAt });
  logger.info("device.created", { restaurantId: parsed.data.restaurantId });
  revalidatePath("/admin/devices");
  return { ok: true, code, expiresAt: expiresAt.toISOString(), deviceName: parsed.data.name };
}

/** Genera un nuevo código para vincular (o volver a vincular) una tablet. */
export async function generatePairingCodeAction(id: string): Promise<PairingState> {
  await requireAdmin();
  const device = await db.query.devices.findFirst({ where: eq(devices.id, id) });
  if (!device) return { error: "Tablet no encontrada" };
  const code = await uniqueCode();
  const expiresAt = new Date(Date.now() + PAIRING_MINUTES * 60 * 1000);
  await db.update(devices).set({ pairingCode: code, pairingExpiresAt: expiresAt, active: true }).where(eq(devices.id, id));
  revalidatePath("/admin/devices");
  return { ok: true, code, expiresAt: expiresAt.toISOString(), deviceName: device.name };
}

/** Revoca el acceso: la tablet vuelve a la pantalla de vinculación. */
export async function revokeDeviceAction(id: string) {
  await requireAdmin();
  await db
    .update(devices)
    .set({ tokenHash: null, pairingCode: null, pairingExpiresAt: null, pairedAt: null })
    .where(eq(devices.id, id));
  logger.info("device.revoked", { deviceId: id });
  revalidatePath("/admin/devices");
}

export async function deleteDeviceAction(id: string) {
  await requireAdmin();
  // Baja lógica: la tablet desaparece de la lista y pierde el acceso, pero sus
  // respuestas siguen mostrando su nombre.
  await db
    .update(devices)
    .set({ active: false, tokenHash: null, pairingCode: null, pairingExpiresAt: null })
    .where(eq(devices.id, id));
  logger.info("device.deleted", { deviceId: id });
  revalidatePath("/admin/devices");
}

export async function renameDeviceAction(id: string, name: string) {
  await requireAdmin();
  const parsed = z.string().trim().min(2).max(60).safeParse(name);
  if (!parsed.success) return;
  await db.update(devices).set({ name: parsed.data }).where(eq(devices.id, id));
  revalidatePath("/admin/devices");
}
