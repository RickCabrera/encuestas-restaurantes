"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { loyaltyRewards, restaurants } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin, requireClientUser } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { adjustPoints, LoyaltyError, MAX_POINTS_PER_SURVEY, redeemReward } from "@/lib/loyalty";

export type LoyaltyActionState = ActionState & { balance?: number };

const redeemSchema = z.object({
  phone: z.string().trim().min(1),
  restaurantId: z.string().refine(isUuid, "Elige una sucursal"),
  rewardId: z.string().refine(isUuid, "Elige un premio"),
});

/** Canje de un premio. Lo pueden hacer administradores y gerentes (en sus sucursales). */
export async function redeemRewardAction(_prev: LoyaltyActionState, fd: FormData): Promise<LoyaltyActionState> {
  const user = await requireClientUser();
  const parsed = redeemSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    const { balance, reward } = await redeemReward(user, parsed.data);
    revalidatePath("/admin/points");
    return {
      ok: true,
      balance,
      message: `Canjeado: ${reward.name}. Le quedan ${balance.toLocaleString("es-MX")} puntos.`,
    };
  } catch (e) {
    if (e instanceof LoyaltyError) return { error: e.message };
    throw e;
  }
}

const adjustSchema = z.object({
  phone: z.string().trim().min(1),
  restaurantId: z.string().refine(isUuid, "Elige una sucursal"),
  points: z.coerce
    .number()
    .int("Usa números enteros")
    .refine((n) => n !== 0, "Escribe una cantidad distinta de cero"),
  note: z.string().trim().min(3, "Escribe el motivo").max(200),
});

/** Ajuste manual de puntos (solo administradores), p. ej. una compensación o una corrección. */
export async function adjustPointsAction(_prev: LoyaltyActionState, fd: FormData): Promise<LoyaltyActionState> {
  const admin = await requireAdmin();
  const parsed = adjustSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    const { balance } = await adjustPoints(admin, parsed.data);
    revalidatePath("/admin/points");
    return { ok: true, balance, message: `Listo. Saldo nuevo: ${balance.toLocaleString("es-MX")} puntos.` };
  } catch (e) {
    if (e instanceof LoyaltyError) return { error: e.message };
    throw e;
  }
}

const rewardSchema = z.object({
  name: z.string().trim().min(2, "Escribe un nombre").max(80),
  description: z.string().trim().max(200).default(""),
  pointsCost: z.coerce
    .number()
    .int("Usa números enteros")
    .min(1, "Debe costar al menos 1 punto")
    .max(1_000_000, "Demasiados puntos"),
});

export async function saveRewardAction(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = rewardSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values: Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])),
    };
  }
  if (id) {
    if (!isUuid(id)) return { error: "Premio no encontrado" };
    const rows = await db
      .update(loyaltyRewards)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(loyaltyRewards.id, id), eq(loyaltyRewards.organizationId, admin.organizationId)))
      .returning({ id: loyaltyRewards.id });
    if (rows.length === 0) return { error: "Premio no encontrado" };
  } else {
    await db.insert(loyaltyRewards).values({ ...parsed.data, organizationId: admin.organizationId });
    logger.info("loyalty.reward_created", { organizationId: admin.organizationId });
  }
  revalidatePath("/admin/points", "layout");
  return { ok: true, message: id ? "Premio actualizado." : "Premio agregado." };
}

/** Activa o desactiva un premio (no se borran: los canjes pasados lo siguen nombrando). */
export async function setRewardActiveAction(id: string, active: boolean) {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  await db
    .update(loyaltyRewards)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(loyaltyRewards.id, id), eq(loyaltyRewards.organizationId, admin.organizationId)));
  revalidatePath("/admin/points", "layout");
}

/**
 * Puntos por encuesta de cada sucursal. El formulario manda `points:<restaurantId>` por renglón;
 * solo se tocan restaurantes de la cadena del administrador.
 */
export async function saveSurveyPointsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const updates: { id: string; points: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("points:")) continue;
    const id = k.slice("points:".length);
    if (!isUuid(id) || !admin.restaurantIds.includes(id)) continue;
    const raw = String(v).trim();
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > MAX_POINTS_PER_SURVEY) {
      return { error: `Los puntos por encuesta van de 0 a ${MAX_POINTS_PER_SURVEY.toLocaleString("es-MX")}.` };
    }
    updates.push({ id, points: n });
  }
  if (updates.length === 0) return { error: "No hay sucursales que guardar." };
  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx
        .update(restaurants)
        .set({ loyaltyPoints: u.points })
        .where(and(eq(restaurants.id, u.id), eq(restaurants.organizationId, admin.organizationId)));
    }
  });
  // Solo para el log: cuántas sucursales quedaron con puntos.
  const on = updates.filter((u) => u.points > 0).map((u) => u.id);
  logger.info("loyalty.points_configured", { organizationId: admin.organizationId, branchesOn: on.length });
  revalidatePath("/admin/points", "layout");
  return { ok: true, message: "Guardado. Las tablets lo toman en cerca de un minuto." };
}
