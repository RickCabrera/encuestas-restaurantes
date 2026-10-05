/** Cuándo la tablet consulta al servidor por su cuenta, sin que nadie la esté usando. */

export const BACKGROUND_REFRESH_MS = 30 * 60_000;

// Los restaurantes están cerrados de madrugada: sin consultas, la base de datos puede suspenderse.
const NIGHT_TIMEZONE = "America/Mexico_City";
const NIGHT_START_HOUR = 0;
const NIGHT_END_HOUR = 7;

/** De 00:00 a 06:59, hora de Ciudad de México, no se hace el refresco en segundo plano. */
export function isNightPause(now: Date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: NIGHT_TIMEZONE, hourCycle: "h23", hour: "2-digit" }).format(now),
  );
  return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;
}
