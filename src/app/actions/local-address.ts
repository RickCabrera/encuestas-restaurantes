"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ACK_ADDRESS_KEY, currentLocalAppUrl } from "@/lib/request";

/**
 * Versión instalada en PC: el administrador ya sabe que la IP cambió (y reimprimió los QR o
 * reservó la IP). Guarda la dirección actual para que deje de salir el aviso hasta que vuelva a
 * cambiar. Las tablets y el panel no dependen de esto: ya usan la IP actual.
 */
export async function acknowledgeLocalAddressAction() {
  await requireAdmin();
  const current = await currentLocalAppUrl();
  if (!current) return;
  await db
    .insert(appSettings)
    .values({ key: ACK_ADDRESS_KEY, value: current })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: current, updatedAt: new Date() } });
  revalidatePath("/admin", "layout");
}
