import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" lanza error fuera de React Server Components; en pruebas es un no-op.
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/support/setup.ts"],
    // Las pruebas de integración comparten la BD de pruebas.
    fileParallelism: false,
    coverage: { include: ["src/lib/**"] },
  },
});
