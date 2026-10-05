import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("gerente: solo ve su restaurante y no entra a configuración", async ({ page, browser }) => {
  // Id de Boca del Río, obtenido como admin en otra sesión.
  const adminPage = await (await browser.newContext()).newPage();
  await login(adminPage);
  await adminPage.goto("/admin/restaurants");
  await adminPage.getByRole("link", { name: "Casa Jarocha Boca del Río" }).click();
  await adminPage.waitForURL(/\/admin\/restaurants\/[0-9a-f-]{36}/);
  const bocaId = new URL(adminPage.url()).pathname.split("/").pop()!;

  await login(page, "gerente@demo.com", "Gerente12345!");
  await expect(page.getByRole("link", { name: "Restaurantes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);

  await page.goto("/admin/restaurants");
  await expect(page).toHaveURL(/error=forbidden/);
  await expect(page.getByText("Esa sección es solo para administradores.")).toBeVisible();

  // El selector solo ofrece su restaurante.
  await expect(page.getByRole("combobox").first()).toContainText("Casa Jarocha Centro");
  await expect(page.getByRole("combobox").first()).not.toContainText("Boca del Río");

  // El subtítulo del resumen nombra su restaurante, no "Todos".
  await page.goto("/admin");
  await expect(page.getByText(/^Casa Jarocha Centro, del /)).toBeVisible();

  // No puede descargar el QR de otro restaurante.
  expect((await page.request.get(`/api/qr/${bocaId}?format=png`)).status()).toBe(404);

  // La exportación tampoco incluye otros restaurantes.
  const res = await page.request.get("/api/export");
  expect(await res.text()).not.toContain("Boca del Río");
});

test("login: credenciales incorrectas y sesión protegida", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Correo").fill("admin@demo.com");
  await page.getByLabel("Contraseña").fill("mala");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  await login(page);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("página pública: restaurante inexistente", async ({ page }) => {
  const res = await page.goto("/r/no-existe");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("No encontramos esta página")).toBeVisible();
});
