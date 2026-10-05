import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ipFromRequest } from "@/lib/request";

/** Vincula una tablet con el código de 6 dígitos generado en el panel. */
export async function POST(req: Request) {
  const ip = ipFromRequest(req);
  const rl = await rateLimit(`pair:${ip}`, 10, 15 * 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Escribe los 6 dígitos del código." }, { status: 400 });

  const device = await db.query.devices.findFirst({
    where: and(eq(devices.pairingCode, parsed.data.code), gt(devices.pairingExpiresAt, new Date())),
  });
  if (!device) return NextResponse.json({ error: "Código incorrecto o vencido. Genera uno nuevo en el panel." }, { status: 404 });

  const token = randomToken();
  await db
    .update(devices)
    .set({
      tokenHash: sha256(token),
      pairingCode: null,
      pairingExpiresAt: null,
      pairedAt: new Date(),
      lastSeenAt: new Date(),
      active: true,
    })
    .where(eq(devices.id, device.id));
  logger.info("device.paired", { deviceId: device.id, restaurantId: device.restaurantId, ip });
  return NextResponse.json({ token, deviceId: device.id, deviceName: device.name });
}
