import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKGROUND_REFRESH_MS, backgroundRefreshMs, isNightPause } from "@/components/kiosk/schedule";

// Ciudad de México es UTC-6 todo el año (sin horario de verano desde 2022).
const cdmx = (hhmm: string, day = "2026-10-05") => new Date(new Date(`${day}T${hhmm}:00Z`).getTime() + 6 * 3_600_000);

describe("refresco en segundo plano de la tablet", () => {
  it("es cada 30 minutos", () => {
    expect(BACKGROUND_REFRESH_MS).toBe(30 * 60_000);
  });

  it("se pausa de 00:00 a 06:59, hora de Ciudad de México", () => {
    expect(isNightPause(cdmx("00:00"))).toBe(true);
    expect(isNightPause(cdmx("03:30"))).toBe(true);
    expect(isNightPause(cdmx("06:59"))).toBe(true);
  });

  it("corre de 07:00 a 23:59", () => {
    expect(isNightPause(cdmx("07:00"))).toBe(false);
    expect(isNightPause(cdmx("14:00"))).toBe(false);
    expect(isNightPause(cdmx("23:59"))).toBe(false);
  });

  it("usa la hora de Ciudad de México, no la UTC ni la de la tablet", () => {
    // 02:00 UTC son las 20:00 del día anterior en México: hora de servicio.
    expect(isNightPause(new Date("2026-10-05T02:00:00Z"))).toBe(false);
    // 12:00 UTC son las 06:00 en México: todavía de madrugada.
    expect(isNightPause(new Date("2026-10-05T12:00:00Z"))).toBe(true);
    // Tampoco cambia en julio, cuando antes había horario de verano.
    expect(isNightPause(new Date("2026-07-15T12:30:00Z"))).toBe(true);
    expect(isNightPause(new Date("2026-07-15T13:00:00Z"))).toBe(false);
  });
});

describe("frecuencia de la consulta en espera", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("en nube sigue siendo cada 30 minutos", () => {
    vi.stubEnv("APP_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "");
    expect(backgroundRefreshMs()).toBe(30 * 60_000);
  });

  it("en modo local baja a 1 minuto", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "local");
    expect(backgroundRefreshMs()).toBe(60_000);
  });
});
