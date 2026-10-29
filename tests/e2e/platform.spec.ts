import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { clearRateLimits, login } from "./helpers";

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/encuestas_e2e";
const PLATFORM = { email: "equipo@sobremesa.test", password: "Plataforma123!" };

test.beforeAll(() => {
  execSync(`npx tsx scripts/platform-admin.ts ${PLATFORM.email} "Equipo E2E" "${PLATFORM.password}"`, {
    env: { ...process.env, DATABASE_URL },
    stdio: "inherit",
  });
});
test.beforeEach(clearRateLimits);

test("landing: la solicitud de demo llega a la Administración", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lo que tus comensales opinan");
  await page.getByLabel("Tu nombre").fill("Lucía Prueba");
  await page.getByLabel("Restaurante o cadena").fill("Mariscos E2E");
  await page.getByLabel("Correo").fill("lucia@mariscos.test");
  await page.locator("#demo").getByRole("button", { name: "Pedir demo" }).click();
  await expect(page.getByText("Solicitud enviada")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Correo").fill(PLATFORM.email);
  await page.getByLabel("Contraseña").fill(PLATFORM.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/plataforma\/clientes$/);
  await expect(page.getByRole("main").getByText("Demo", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: /Solicitudes/ }).click();
  const card = page.getByRole("listitem").filter({ hasText: "lucia@mariscos.test" }).first();
  await expect(card.getByText("Mariscos E2E").first()).toBeVisible();
  await card.getByRole("button", { name: "Dar de alta" }).click();
  const dialog = page.getByRole("dialog", { name: "Dar de alta a Mariscos E2E" });
  await dialog.getByRole("button", { name: "Generar enlace" }).click();
  await expect(dialog.getByRole("textbox", { name: "Enlace", exact: true })).toHaveValue(/\/registro\?codigo=/, {
    timeout: 15_000,
  });
});

test("un administrador de un negocio no entra a la Administración", async ({ page }) => {
  await login(page);
  await page.goto("/plataforma/clientes");
  await expect(page).toHaveURL(/\/admin$/);
});
