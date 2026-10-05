// Sin "server-only": también lo usan scripts/create-invite.ts y scripts/invite-org.ts.
import bcrypt from "bcryptjs";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { organizations, restaurants, signupInvites, userRestaurants, users, type User, type UserRole } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { isProtectedOrgName, ORG_NAME_MAX, ORG_NAME_MIN } from "./orgs";

export const INVITE_DAYS = 7;
export const INVITE_INVALID_MESSAGE = "Este enlace no es válido o ya fue usado. Pide uno nuevo.";

// 32 bytes en base64url son 43 caracteres.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function inviteLink(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/$/, "")}/registro?codigo=${token}`;
}

function newToken() {
  const token = randomToken(32);
  return { token, tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000) };
}

/**
 * Crea una invitación de un solo uso para entrar a una cadena que ya existe.
 * El token solo existe en el valor que se devuelve aquí.
 */
export async function createInvite(opts: { organizationId: string; role?: UserRole; restaurantIds?: string[] }) {
  const role = opts.role ?? "ADMIN";
  const { token, tokenHash, expiresAt } = newToken();
  const [row] = await db
    .insert(signupInvites)
    .values({
      tokenHash,
      kind: "USER",
      organizationId: opts.organizationId,
      role,
      restaurantIds: role === "MANAGER" ? (opts.restaurantIds ?? []) : [],
      expiresAt,
    })
    .returning({ id: signupInvites.id });
  return { id: row.id, token, expiresAt };
}

/** Crea una invitación de un solo uso para dar de alta una cadena nueva con su administrador. */
export async function createOrgInvite() {
  const { token, tokenHash, expiresAt } = newToken();
  const [row] = await db
    .insert(signupInvites)
    .values({ tokenHash, kind: "NEW_ORG", organizationId: null, role: "ADMIN", expiresAt })
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

export type RegisterResult = { ok: true; user: User } | { ok: false; reason: "invalid" | "email" | "orgName" | "orgNameTaken" };

/**
 * Crea la cuenta de quien recibió la invitación y la marca como usada, todo en una transacción.
 * La fila de la invitación se bloquea (FOR UPDATE): de dos envíos simultáneos solo uno gana.
 * Con una invitación NEW_ORG, la misma transacción crea además la cadena y deja a la cuenta como su administrador.
 */
export async function registerWithInvite(input: {
  token: string;
  name: string;
  email: string;
  password: string;
  /** Nombre de la cadena nueva. Solo cuenta (y es obligatorio) con una invitación NEW_ORG. */
  orgName?: string;
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

      const orgName = (input.orgName ?? "").trim();
      if (invite.kind === "NEW_ORG") {
        if (orgName.length < ORG_NAME_MIN || orgName.length > ORG_NAME_MAX) return { ok: false, reason: "orgName" };
        // "Demo" es la cadena protegida: una segunda con ese nombre no se podría borrar nunca.
        if (isProtectedOrgName(orgName)) return { ok: false, reason: "orgNameTaken" };
      }

      const exists = await tx.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
      if (exists) return { ok: false, reason: "email" };

      let organizationId = invite.organizationId;
      if (invite.kind === "NEW_ORG") {
        const [org] = await tx.insert(organizations).values({ name: orgName }).returning({ id: organizations.id });
        organizationId = org.id;
      }
      // Lo garantiza el CHECK de la tabla; si aun así faltara, no se crea una cuenta sin cadena.
      if (!organizationId) return { ok: false, reason: "invalid" };

      // Quien funda la cadena siempre es su administrador.
      const role = invite.kind === "NEW_ORG" ? "ADMIN" : invite.role;
      const [user] = await tx
        .insert(users)
        .values({
          organizationId,
          name: input.name.trim(),
          email,
          passwordHash,
          role,
          notifyLowScores: role === "ADMIN",
        })
        .returning();
      if (role === "MANAGER" && invite.restaurantIds.length) {
        // Solo los restaurantes que sigan existiendo, y solo de la cadena de la invitación.
        const alive = await tx
          .select({ id: restaurants.id })
          .from(restaurants)
          .where(and(inArray(restaurants.id, invite.restaurantIds), eq(restaurants.organizationId, organizationId)));
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
