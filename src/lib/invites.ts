// Sin "server-only": también lo usa scripts/create-invite.ts.
import bcrypt from "bcryptjs";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { restaurants, signupInvites, userRestaurants, users, type User, type UserRole } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";

export const INVITE_DAYS = 7;
export const INVITE_INVALID_MESSAGE = "Este enlace no es válido o ya fue usado. Pide uno nuevo.";

// 32 bytes en base64url son 43 caracteres.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function inviteLink(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/$/, "")}/registro?codigo=${token}`;
}

/** Crea una invitación de un solo uso. El token solo existe en el valor que se devuelve aquí. */
export async function createInvite(opts: { role?: UserRole; restaurantIds?: string[] } = {}) {
  const role = opts.role ?? "ADMIN";
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000);
  const [row] = await db
    .insert(signupInvites)
    .values({
      tokenHash: sha256(token),
      role,
      restaurantIds: role === "MANAGER" ? (opts.restaurantIds ?? []) : [],
      expiresAt,
    })
    .returning({ id: signupInvites.id });
  return { id: row.id, token, expiresAt };
}

/** Invitación vigente (sin usar y sin vencer) para ese token, o null. */
export async function findUsableInvite(token: string | null | undefined) {
  if (!token || !TOKEN_RE.test(token)) return null;
  const row = await db.query.signupInvites.findFirst({
    where: and(eq(signupInvites.tokenHash, sha256(token)), isNull(signupInvites.usedAt), gt(signupInvites.expiresAt, new Date())),
  });
  return row ?? null;
}

export type RegisterResult = { ok: true; user: User } | { ok: false; reason: "invalid" | "email" };

/**
 * Crea la cuenta de quien recibió la invitación y la marca como usada, todo en una transacción.
 * La fila de la invitación se bloquea (FOR UPDATE): de dos envíos simultáneos solo uno gana.
 */
export async function registerWithInvite(input: {
  token: string;
  name: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  if (!TOKEN_RE.test(input.token)) return { ok: false, reason: "invalid" };
  const email = input.email.toLowerCase().trim();
  // El hash es lento: se calcula antes para no tener la fila bloqueada mientras tanto.
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    return await db.transaction(async (tx): Promise<RegisterResult> => {
      const [invite] = await tx
        .select()
        .from(signupInvites)
        .where(eq(signupInvites.tokenHash, sha256(input.token)))
        .for("update");
      if (!invite || invite.usedAt || invite.expiresAt <= new Date()) return { ok: false, reason: "invalid" };

      const exists = await tx.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
      if (exists) return { ok: false, reason: "email" };

      const [user] = await tx
        .insert(users)
        .values({
          name: input.name.trim(),
          email,
          passwordHash,
          role: invite.role,
          notifyLowScores: invite.role === "ADMIN",
        })
        .returning();
      if (invite.role === "MANAGER" && invite.restaurantIds.length) {
        // Solo los restaurantes que sigan existiendo.
        const alive = await tx
          .select({ id: restaurants.id })
          .from(restaurants)
          .where(inArray(restaurants.id, invite.restaurantIds));
        if (alive.length) {
          await tx.insert(userRestaurants).values(alive.map((r) => ({ userId: user.id, restaurantId: r.id })));
        }
      }
      await tx.update(signupInvites).set({ usedAt: new Date(), usedByUserId: user.id }).where(eq(signupInvites.id, invite.id));
      return { ok: true, user };
    });
  } catch (e) {
    // Otra invitación registró ese mismo correo al mismo tiempo (índice único de users.email).
    if (isUniqueViolation(e)) return { ok: false, reason: "email" };
    throw e;
  }
}

function isUniqueViolation(e: unknown) {
  const code = (x: unknown) => (x as { code?: string } | null)?.code;
  return code(e) === "23505" || code((e as { cause?: unknown } | null)?.cause) === "23505";
}
