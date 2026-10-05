import { execSync } from "node:child_process";

/** Deja la BD de E2E migrada y con el seed básico (sin respuestas demo). */
export default function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/encuestas_e2e",
    SEED_ADMIN_EMAIL: "admin@demo.com",
    SEED_ADMIN_PASSWORD: "Admin12345!",
  };
  execSync("npx tsx scripts/migrate.ts", { env, stdio: "inherit" });
  execSync("npx tsx scripts/seed.ts", { env, stdio: "inherit" });
}
