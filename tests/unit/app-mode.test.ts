import { afterEach, describe, expect, it, vi } from "vitest";
import { isNightPause } from "@/components/kiosk/schedule";
import { isLocalMode, secureCookies } from "@/lib/app-mode";

// 03:00 en Ciudad de México: plena pausa nocturna en nube.
const NIGHT = new Date("2026-10-05T09:00:00Z");

type Header = { key: string; value: string };

async function loadNextConfig() {
  vi.resetModules();
  const config = (await import("../../next.config")).default;
  const rules = await config.headers!();
  const all = rules.find((r) => r.source === "/:path*")!.headers as Header[];
  return { config, headers: all.map((h) => h.key) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("nube (sin APP_MODE)", () => {
  it("no es modo local", () => {
    expect(isLocalMode()).toBe(false);
    vi.stubEnv("APP_MODE", "otra-cosa");
    expect(isLocalMode()).toBe(false);
  });

  it("la cookie de sesión es secure en producción", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(secureCookies()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(secureCookies()).toBe(false);
  });

  it("la tablet conserva la pausa nocturna", () => {
    expect(isNightPause(NIGHT)).toBe(true);
  });

  it("el build no es standalone y envía HSTS", async () => {
    const { config, headers } = await loadNextConfig();
    expect(config.output).toBeUndefined();
    expect(config.env).toBeUndefined();
    expect(headers).toContain("Strict-Transport-Security");
    expect(headers).toContain("Content-Security-Policy");
  });
});

describe("APP_MODE=local", () => {
  it("la cookie de sesión funciona sobre http", () => {
    vi.stubEnv("APP_MODE", "local");
    vi.stubEnv("NODE_ENV", "production");
    expect(isLocalMode()).toBe(true);
    expect(secureCookies()).toBe(false);
  });

  it("el navegador lo sabe por NEXT_PUBLIC_APP_MODE", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "local");
    expect(isLocalMode()).toBe(true);
  });

  it("la tablet no hace pausa nocturna", () => {
    vi.stubEnv("APP_MODE", "local");
    expect(isNightPause(NIGHT)).toBe(false);
  });

  it("el build es standalone, sin HSTS y con el resto de los headers", async () => {
    vi.stubEnv("APP_MODE", "local");
    const { config, headers } = await loadNextConfig();
    expect(config.output).toBe("standalone");
    expect(config.env).toEqual({ NEXT_PUBLIC_APP_MODE: "local" });
    expect(headers).not.toContain("Strict-Transport-Security");
    expect(headers).toContain("Content-Security-Policy");
  });
});
