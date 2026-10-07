/** Cuándo la tablet consulta al servidor por su cuenta, sin que nadie la esté usando. */

import { isLocalMode } from "@/lib/app-mode";

export const BACKGROUND_REFRESH_MS = 30 * 60_000;
export const LOCAL_BACKGROUND_REFRESH_MS = 60_000;

/**
 * Cada cuánto consulta la tablet en espera. En nube, cada 30 minutos para no mantener despierta
 * la base; en modo local la base está en la misma PC y se consulta cada minuto, así la tablet
 * nota pronto si la desvincularon desde el panel.
 */
export function backgroundRefreshMs() {
  return isLocalMode() ? LOCAL_BACKGROUND_REFRESH_MS : BACKGROUND_REFRESH_MS;
}

// Los restaurantes están cerrados de madrugada: sin consultas, la base de datos puede suspenderse.
const NIGHT_TIMEZONE = "America/Mexico_City";
const NIGHT_START_HOUR = 0;
const NIGHT_END_HOUR = 7;

/**
 * De 00:00 a 06:59, hora de Ciudad de México, no se hace el refresco en segundo plano.
 * En modo local no hay pausa: la base está en la misma PC y no se suspende.
 */
export function isNightPause(now: Date = new Date()) {
  if (isLocalMode()) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: NIGHT_TIMEZONE, hourCycle: "h23", hour: "2-digit" }).format(now),
  );
  return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;
}
