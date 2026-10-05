import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Para migraciones usa la conexión directa (no el pooler) si está disponible.
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!,
  },
  strict: true,
});
