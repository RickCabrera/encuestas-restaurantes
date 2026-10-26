import "server-only";
import { headers } from "next/headers";
import { isLocalMode } from "@/lib/app-mode";
import { currentLanAddress, isPrivateIPv4 } from "@/lib/lan-address";

/** IP del cliente detrás del proxy de Vercel / nginx. */
export async function clientIp() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

export function ipFromRequest(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function parseUrl(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** La dirección guardada en APP_URL al instalar (o con "Actualizar la IP"), sin diagonal final. */
export function configuredAppUrl() {
  return (process.env.APP_URL ?? "").replace(/\/$/, "");
}

/**
 * Versión instalada en PC: la dirección con la IP que la PC tiene ahora. Si el router le cambió
 * la IP, el panel, los QR nuevos y la dirección para las tablets salen ya con la nueva.
 */
async function localAppUrl() {
  const configured = parseUrl(process.env.APP_URL);
  const port = configured?.port || process.env.PORT || "3000";
  const h = await headers();
  const hostIp = (h.get("host") ?? "").replace(/:\d+$/, "");
  const ip = await currentLanAddress(
    isPrivateIPv4(hostIp) ? hostIp : null,
    configured && isPrivateIPv4(configured.hostname) ? configured.hostname : null,
  );
  if (ip) return `http://${ip}:${port}`;
  return configuredAppUrl() || `http://localhost:${port}`;
}

/** URL pública de la app (para QR y correos). */
export async function appUrl() {
  if (isLocalMode()) return localAppUrl();
  if (process.env.APP_URL) return configuredAppUrl();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Versión instalada en PC: si la IP cambió desde que se configuró APP_URL, las dos direcciones
 * (para avisar que los QR ya impresos llevan la anterior). null si no cambió o en nube.
 */
export async function changedLocalAddress() {
  if (!isLocalMode()) return null;
  const configured = configuredAppUrl();
  if (!configured) return null;
  const current = await localAppUrl();
  return current === configured ? null : { configured, current };
}
