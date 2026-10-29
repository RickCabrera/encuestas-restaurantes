import "server-only";
import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { isLocalMode, secureCookies } from "./app-mode";
import { orgAllowed } from "./license-local";
import { buildSessionUser, type SessionUser } from "./session-user";

export type { SessionUser };

const COOKIE = "session";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(s);
}

function sessionDays() {
  const d = Number(process.env.SESSION_DAYS ?? 7);
  return Number.isFinite(d) && d > 0 ? d : 7;
}

export async function createSession(user: Pick<User, "id" | "sessionVersion">) {
  const days = sessionDays();
  const token = await new SignJWT({ sv: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: days * 24 * 3600,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Usuario de la sesión actual (memoizado por request). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });
    if (!user || !user.active || user.sessionVersion !== payload.sv) return null;
    // En la PC, la cadena tiene que tener licencia vigente de su cliente de la nube.
    if (isLocalMode() && !(await orgAllowed(user.organizationId))) return null;
    return await buildSessionUser(user);
  } catch {
    return null;
  }
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    // Ruta original (la pone src/proxy.ts) para regresar ahí después del login.
    const path = (await headers()).get("x-request-path");
    const back = path && (path.startsWith("/admin") || path.startsWith("/plataforma")) && path !== "/admin";
    redirect(back ? `/login?next=${encodeURIComponent(path)}` : "/login");
  }
  return user;
}

/** Usuario del panel de un negocio. Las cuentas del equipo interno no tienen negocio: van a la Administración. */
export async function requireClientUser() {
  const user = await requireUser();
  if (user.organizationInternal && user.platformAdmin) redirect("/plataforma");
  return user;
}

/**
 * Administración de la plataforma (/plataforma). En la versión instalada en PC no existe:
 * esa instalación es de un solo negocio.
 */
export async function requirePlatformAdmin() {
  if (isLocalMode()) notFound();
  const user = await requireUser();
  if (!user.platformAdmin) redirect("/admin");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/admin?error=forbidden");
  return user;
}
