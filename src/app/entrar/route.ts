import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { loginTokens, organizations, users } from "@/db/schema";
import { isLocalMode } from "@/lib/app-mode";
import { createSession } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const goTo = (path: string) => new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });

/**
 * Entrada de un solo uso desde Sobremesa instalado en PC (modo Nube): la PC ya validó el correo y
 * la contraseña contra la nube; aquí se abre la sesión de la web y se va al panel. Solo en la nube.
 */
export async function GET(request: Request) {
  if (isLocalMode()) return new Response(null, { status: 404 });
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return goTo("/login");
  const [row] = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(loginTokens.tokenHash, sha256(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())))
    .returning({ userId: loginTokens.userId });
  if (!row) return goTo("/login");
  const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
  if (!user?.active) return goTo("/login");
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) });
  if (!org?.active) return goTo("/login");
  await createSession(user);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  logger.info("auth.login_from_pc", { userId: user.id });
  return goTo("/admin");
}
