import "server-only";
import { and, eq, lt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { devices, restaurants } from "@/db/schema";
import { sha256 } from "./crypto";

/** Autentica una tablet por su token `Authorization: Bearer …`. */
export async function authenticateDevice(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token.length < 20) return null;
  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      restaurantId: devices.restaurantId,
      restaurantActive: restaurants.active,
    })
    .from(devices)
    .innerJoin(restaurants, eq(restaurants.id, devices.restaurantId))
    .where(and(eq(devices.tokenHash, sha256(token)), eq(devices.active, true)))
    .limit(1);
  const device = rows[0];
  if (!device) return null;
  // Actualiza "último uso" como máximo una vez por minuto.
  await db
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(
      and(eq(devices.id, device.id), or(isNull(devices.lastSeenAt), lt(devices.lastSeenAt, sql`now() - interval '1 minute'`))),
    );
  return device;
}
