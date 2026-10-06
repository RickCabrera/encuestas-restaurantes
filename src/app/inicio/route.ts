import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isLocalMode } from "@/lib/app-mode";
import { createOrgInvite } from "@/lib/invites";

export const dynamic = "force-dynamic";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const notFound = () => new Response(null, { status: 404 });
const goTo = (path: string) => new Response(null, { status: 307, headers: { Location: path, "Cache-Control": "no-store" } });

function sameKey(given: string | null, expected: string | undefined) {
  if (!given || !expected || expected.length < 32) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Puerta de entrada del acceso directo "Sobremesa Encuestas" en la versión instalada en PC
 * (docs/INSTALAR-PC.md): sin usuarios lleva a crear la cadena y su usuario maestro; con usuarios, al login.
 *
 * Solo existe con APP_MODE=local, para peticiones desde la propia PC y con la llave que el
 * instalador guardó en ella. En nube, o desde la red, responde 404.
 */
export async function GET(request: Request) {
  // LOCAL_TRUSTED_REMOTE lo pone installer/scripts/local-server.cjs, que es quien garantiza
  // que x-forwarded-for trae la IP real de la conexión y no lo que mande el cliente.
  if (!isLocalMode() || process.env.LOCAL_TRUSTED_REMOTE !== "1") return notFound();
  if (!LOOPBACK.has(request.headers.get("x-forwarded-for") ?? "")) return notFound();
  if (!sameKey(new URL(request.url).searchParams.get("llave"), process.env.LOCAL_SETUP_KEY)) return notFound();

  const [{ count }] = await db.execute<{ count: number }>(sql`select count(*)::int as count from users`);
  if (count > 0) return goTo("/login");
  const { token } = await createOrgInvite();
  return goTo(`/registro?codigo=${token}`);
}
