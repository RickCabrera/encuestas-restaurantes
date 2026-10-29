import "server-only";
import { hostname } from "node:os";
import { inArray } from "drizzle-orm";
import { after, connection } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { isLocalMode } from "./app-mode";
import { LICENSE_RENEW_AFTER_MS, verifyLicense, type LicenseClaims } from "./license-token";
import { logger } from "./logger";
import { getSetting, setSetting } from "./settings";

/**
 * Lado PC de las licencias (versión instalada, APP_MODE=local). La PC guarda en app_settings su
 * licencia firmada por la nube y las credenciales de su instalación. Sin licencia vigente, el panel,
 * las tablets y el QR de esa PC se bloquean (ver requireLicense y licenseAllows).
 */
const DEFAULT_LICENSE_SERVER = "https://encuestas-restaurantes-production.up.railway.app";

const K = {
  token: "license_token",
  id: "license_installation_id",
  secret: "license_secret",
  block: "license_block",
  lastTry: "license_last_try",
} as const;

export type LicenseBlock = "inactive" | "revoked";
export type LicenseState =
  | { status: "valid"; claims: LicenseClaims }
  | { status: "missing" }
  | { status: "expired" }
  | { status: "blocked"; reason: LicenseBlock };

export function licenseServerUrl() {
  return (process.env.LICENSE_SERVER_URL || DEFAULT_LICENSE_SERVER).replace(/\/$/, "");
}

async function clear(keys: string[]) {
  await db.delete(appSettings).where(inArray(appSettings.key, keys));
}

export async function getLicenseState(): Promise<LicenseState> {
  const block = (await getSetting(K.block)) as LicenseBlock | null;
  if (block === "inactive" || block === "revoked") return { status: "blocked", reason: block };
  const claims = await verifyLicense(await getSetting(K.token));
  if (claims) return { status: "valid", claims };
  return (await getSetting(K.id)) ? { status: "expired" } : { status: "missing" };
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${licenseServerUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, data };
}

async function store(data: Record<string, unknown>) {
  await setSetting(K.token, String(data.license));
  if (typeof data.secret === "string") await setSetting(K.secret, data.secret);
  await setSetting(K.id, String(data.installationId));
  await clear([K.block]);
}

/**
 * Pide a la nube una licencia nueva. Sin internet no cambia nada (la licencia guardada sigue
 * valiendo hasta su vencimiento). Si la nube dice que el cliente se desactivó o la instalación
 * se revocó, la PC se bloquea en ese momento.
 */
export async function renewLicense(): Promise<"ok" | "offline" | LicenseBlock | "none"> {
  const [installationId, secret] = await Promise.all([getSetting(K.id), getSetting(K.secret)]);
  if (!installationId || !secret) return "none";
  await setSetting(K.lastTry, String(Date.now()));
  try {
    const { status, data } = await postJson("/api/licencia/renovar", {
      installationId,
      secret,
      version: process.env.APP_VERSION ?? null,
    });
    if (status === 200 && typeof data.license === "string") {
      await store(data);
      return "ok";
    }
    if (status === 403 && data.error === "inactive") {
      await clear([K.token]);
      await setSetting(K.block, "inactive");
      return "inactive";
    }
    if (status === 403 && data.error === "revoked") {
      await clear([K.token, K.id, K.secret]);
      await setSetting(K.block, "revoked");
      return "revoked";
    }
    return "offline";
  } catch (e) {
    logger.warn("license.renew_failed", { message: (e as Error).message });
    return "offline";
  }
}

export type ActivateResult = { ok: true; organizationName: string } | { ok: false; error: string };

/** Activa esta PC con la cuenta de administrador del negocio en la nube. */
export async function activateLicense(email: string, password: string): Promise<ActivateResult> {
  try {
    const { status, data } = await postJson("/api/licencia/activar", {
      email,
      password,
      name: hostname(),
      version: process.env.APP_VERSION ?? null,
    });
    if (status === 200 && typeof data.license === "string" && (await verifyLicense(data.license))) {
      await clear([K.token, K.id, K.secret, K.block]);
      await store(data);
      return { ok: true, organizationName: String(data.organizationName ?? "") };
    }
    const messages: Record<string, string> = {
      credentials: "Correo o contraseña incorrectos. Usa la cuenta de tu negocio en la web de Sobremesa.",
      role: "Esa cuenta no es administrador de un negocio. Entra con la cuenta del dueño o administrador.",
      inactive: "Tu cuenta de Sobremesa está desactivada. Escríbenos para reactivarla.",
      rate_limited: "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
      unavailable: "El servicio de licencias no está disponible por ahora. Intenta más tarde.",
    };
    return { ok: false, error: messages[String(data.error)] ?? "No se pudo activar. Intenta de nuevo en un momento." };
  } catch {
    return { ok: false, error: "No hay conexión con Sobremesa. Revisa el internet de esta PC e intenta de nuevo." };
  }
}

/**
 * ¿Puede operar esta instalación? En la nube siempre. En la PC: con licencia vigente. Si está por
 * vencer, la renueva en segundo plano; si ya venció pero la PC tiene credenciales, intenta renovarla
 * en ese momento (como mucho una vez por minuto).
 */
export async function licenseAllows(): Promise<boolean> {
  if (!isLocalMode()) return true;
  // Depende de la base en cada petición: que Next no intente prerenderizar la página al compilar.
  await connection();
  const state = await getLicenseState();
  const lastTry = Number((await getSetting(K.lastTry)) ?? 0);
  if (state.status === "valid") {
    const stale = Date.now() - state.claims.issuedAt.getTime() > LICENSE_RENEW_AFTER_MS;
    if (stale && Date.now() - lastTry > 10 * 60 * 1000) {
      try {
        after(() => renewLicense());
      } catch {
        void renewLicense();
      }
    }
    return true;
  }
  // Bloqueada por la nube o vencida: si hay con qué, se vuelve a preguntar (p. ej. ya la reactivaron).
  if (state.status !== "missing" && Date.now() - lastTry > 60 * 1000) {
    if ((await renewLicense()) === "ok") return true;
  }
  return false;
}

/** Páginas del panel en la PC: sin licencia vigente llevan a la pantalla de activación. */
export async function requireLicense() {
  if (!(await licenseAllows())) {
    const { redirect } = await import("next/navigation");
    redirect("/activar");
  }
}
