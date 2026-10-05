"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { userRestaurants, users } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin, requireUser, type SessionUser } from "@/lib/auth";
import { canAccessRestaurant } from "@/lib/authz";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";

const userSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(80),
  email: z.email("Correo inválido").transform((v) => v.toLowerCase().trim()),
  role: z.enum(["ADMIN", "MANAGER"]),
  notifyLowScores: z.boolean(),
  restaurantIds: z.array(z.string().refine(isUuid)).default([]),
});

function parseUser(fd: FormData) {
  return userSchema.safeParse({
    name: fd.get("name"),
    email: fd.get("email"),
    role: fd.get("role"),
    notifyLowScores: fd.get("notifyLowScores") === "on",
    restaurantIds: fd.getAll("restaurantIds").map(String),
  });
}

/** Condición para tocar a un usuario: ese id y que sea de la cadena del administrador. */
function ownUser(admin: SessionUser, id: string) {
  return and(eq(users.id, id), eq(users.organizationId, admin.organizationId));
}

/** Un gerente solo puede recibir restaurantes de la cadena de quien lo administra. */
function foreignRestaurant(admin: SessionUser, restaurantIds: string[]) {
  return restaurantIds.some((r) => !canAccessRestaurant(admin, r));
}

const BAD_RESTAURANTS: ActionState = { fieldErrors: { restaurantIds: ["Elige restaurantes de la lista"] } };

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseUser(fd);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { fieldErrors: { password: ["Mínimo 8 caracteres"] } };
  const d = parsed.data;
  if (d.role === "MANAGER" && d.restaurantIds.length === 0)
    return { fieldErrors: { restaurantIds: ["Asigna al menos un restaurante"] } };
  if (d.role === "MANAGER" && foreignRestaurant(admin, d.restaurantIds)) return BAD_RESTAURANTS;
  // El correo es único en todo el sistema, no solo en la cadena.
  const exists = await db.query.users.findFirst({ where: eq(users.email, d.email), columns: { id: true } });
  if (exists) return { fieldErrors: { email: ["Ya existe un usuario con ese correo"] } };

  await db.transaction(async (tx) => {
    const [u] = await tx
      .insert(users)
      .values({
        organizationId: admin.organizationId,
        name: d.name,
        email: d.email,
        role: d.role,
        notifyLowScores: d.notifyLowScores,
        passwordHash: await bcrypt.hash(password, 10),
      })
      .returning();
    if (d.role === "MANAGER") {
      await tx.insert(userRestaurants).values(d.restaurantIds.map((restaurantId) => ({ userId: u.id, restaurantId })));
    }
  });
  logger.info("user.created", { email: d.email, role: d.role });
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

export async function updateUserAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const target = isUuid(id) ? await db.query.users.findFirst({ where: ownUser(admin, id), columns: { id: true } }) : undefined;
  if (!target) return { error: "Usuario no encontrado." };
  const parsed = parseUser(fd);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;
  if (id === admin.id && d.role !== "ADMIN") return { error: "No puedes quitarte el rol de administrador." };
  if (d.role === "MANAGER" && d.restaurantIds.length === 0)
    return { fieldErrors: { restaurantIds: ["Asigna al menos un restaurante"] } };
  if (d.role === "MANAGER" && foreignRestaurant(admin, d.restaurantIds)) return BAD_RESTAURANTS;
  const clash = await db.query.users.findFirst({
    where: and(eq(users.email, d.email), ne(users.id, id)),
    columns: { id: true },
  });
  if (clash) return { fieldErrors: { email: ["Ya existe un usuario con ese correo"] } };

  const password = String(fd.get("password") ?? "");
  if (password && password.length < 8) return { fieldErrors: { password: ["Mínimo 8 caracteres"] } };

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        name: d.name,
        email: d.email,
        role: d.role,
        notifyLowScores: d.notifyLowScores,
        ...(password ? { passwordHash: await bcrypt.hash(password, 10), sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
      })
      .where(ownUser(admin, id));
    await tx.delete(userRestaurants).where(eq(userRestaurants.userId, id));
    if (d.role === "MANAGER") {
      await tx.insert(userRestaurants).values(d.restaurantIds.map((restaurantId) => ({ userId: id, restaurantId })));
    }
  });
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

export async function setUserActiveAction(id: string, active: boolean) {
  const admin = await requireAdmin();
  if (id === admin.id || !isUuid(id)) return;
  const rows = await db
    .update(users)
    .set({ active, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(ownUser(admin, id))
    .returning({ id: users.id });
  if (rows.length === 0) return;
  logger.info("user.active_changed", { userId: id, active });
  revalidatePath("/admin/users");
}

export async function updateNotificationsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  await db
    .update(users)
    .set({ notifyLowScores: fd.get("notifyLowScores") === "on" })
    .where(eq(users.id, user.id));
  revalidatePath("/admin/account");
  return { ok: true, message: "Preferencias guardadas." };
}
