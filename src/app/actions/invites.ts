"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { signupInvites } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth";
import { canAccessRestaurant } from "@/lib/authz";
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
    // Solo restaurantes de la cadena de quien invita.
    if (!restaurantIds.every((r) => isUuid(r) && canAccessRestaurant(admin, r)))
      return { fieldErrors: { restaurantIds: ["Elige restaurantes de la lista"] } };
  }
  // La cuenta nueva entra a la cadena de quien invita.
  const invite = await createInvite({ organizationId: admin.organizationId, role, restaurantIds });
  logger.info("invite.created", { inviteId: invite.id, role, by: admin.id });
  revalidatePath("/admin/users");
  return { ok: true, link: inviteLink(await appUrl(), invite.token), expiresLabel: formatDateTime(invite.expiresAt) };
}

/** Cancela una invitación que todavía no se usa: su enlace deja de servir. */
export async function cancelInviteAction(id: string) {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  const rows = await db
    .delete(signupInvites)
    .where(and(eq(signupInvites.id, id), eq(signupInvites.organizationId, admin.organizationId), isNull(signupInvites.usedAt)))
    .returning({ id: signupInvites.id });
  if (rows.length === 0) return;
  logger.info("invite.cancelled", { inviteId: id, by: admin.id });
  revalidatePath("/admin/users");
}
