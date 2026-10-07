// E2E de la versión instalada en PC (APP_MODE=local): corre contra el servidor que empaqueta
// el instalador, por localhost y por la IP de la red (http sin "secure context").
//
//   powershell -ExecutionPolicy Bypass -File installer\build.ps1 -SkipSetup
//   npm run test:e2e:local
//
// No instala nada: usa installer/build/payload/app y la misma base de E2E que `npm run test:e2e`.
import { networkInterfaces } from "node:os";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_LOCAL_PORT ?? 3200);
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/encuestas_e2e";

function lanIp() {
  if (process.env.LAN_IP) return process.env.LAN_IP;
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254.")) return net.address;
  }
  throw new Error("Esta PC no tiene red: define LAN_IP con su IP local.");
}

export const LOCAL = {
  lan: `http://${lanIp()}:${PORT}`,
  localhost: `http://localhost:${PORT}`,
  setupKey: "e2e-llave-de-inicio-0123456789abcdef0123456789abcdef",
  version: "9.9.9",
};

export default defineConfig({
  testDir: "tests/local",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: LOCAL.lan, trace: "retain-on-failure", locale: "es-MX", timezoneId: "America/Mexico_City" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node installer/build/payload/app/local-server.cjs",
    url: `${LOCAL.localhost}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL,
      AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
      // Como en la PC instalada: APP_URL lleva la IP de la red, no localhost.
      APP_URL: LOCAL.lan,
      APP_MODE: "local",
      APP_VERSION: LOCAL.version,
      LOCAL_SETUP_KEY: LOCAL.setupKey,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "0.0.0.0",
    },
  },
});
