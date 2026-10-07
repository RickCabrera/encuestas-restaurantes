import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { authenticateDevice } from "@/lib/device-auth";
import { logger } from "@/lib/logger";

/**
 * "Desvincular esta tablet" desde la propia tablet. No recibe ningún id: la tablet que se libera
 * es siempre la dueña del token, así que una tablet no puede desvincular a otra.
 */
export async function POST(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return NextResponse.json({ error: "Tablet no vinculada" }, { status: 401 });
  await db
    .update(devices)
    .set({ tokenHash: null, pairingCode: null, pairingExpiresAt: null, pairedAt: null })
    .where(eq(devices.id, device.id));
  logger.info("device.unpaired", { deviceId: device.id, restaurantId: device.restaurantId });
  return NextResponse.json({ ok: true });
}
