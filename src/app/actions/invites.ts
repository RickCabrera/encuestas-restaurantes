"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { restaurants, signupInvites } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { createInvite, inviteLink } from "@/lib/invites";
import { logger } from "@/lib/logger";
import { appUrl } from "@/lib/request";

export type InviteState = ActionState & {
  /** Enlace de registro. Solo viaja en esta respuesta: en la base queda únicamente su hash. */
  link?: string;
  expiresLabel?: string;
};

export async function createInviteAction(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const admin = await requireAdmin();
  const role = fd.get("role") === "MANAGER" ? "MANAGER" : "ADMIN";
  const restaurantIds = role === "MANAGER" ? [...new Set(fd.getAll("restaurantIds").map(String))] : [];
  if (role === "MANAGER") {
    if (restaurantIds.length === 0) return { fieldErrors: { restaurantIds: ["Asigna al menos un restaurante"] } };
    const found = restaurantIds.every(isUuid)
      ? await db.select({ id: restaurants.id }).from(restaurants).where(inArray(restaurants.id, restaurantIds))
      : [];
    if (found.length !== restaurantIds.length) return { fieldErrors: { restaurantIds: ["Elige restaurantes de la lista"] } };
  }
  const invite = await createInvite({ role, restaurantIds });
  logger.info("invite.created", { inviteId: invite.id, role, by: admin.id });
  revalidatePath("/admin/users");
  return { ok: true, link: inviteLink(await appUrl(), invite.token), expiresLabel: formatDateTime(invite.expiresAt) };
}

/** Cancela una invitación que todavía no se usa: su enlace deja de servir. */
export async function cancelInviteAction(id: string) {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  await db.delete(signupInvites).where(and(eq(signupInvites.id, id), isNull(signupInvites.usedAt)));
  logger.info("invite.cancelled", { inviteId: id, by: admin.id });
  revalidatePath("/admin/users");
}
