import { expect, test } from "@playwright/test";
import { answerBaseSurvey, login } from "./helpers";

test("tablet: se vincula con código, responde, funciona sin internet y sincroniza", async ({ page, browser }) => {
  await login(page);
  await page.goto("/admin/devices");
  await page.getByRole("button", { name: "Agregar tablet" }).first().click();
  await page.getByLabel("Nombre").fill("Tablet E2E");
  await page.getByLabel("Restaurante", { exact: true }).selectOption({ label: "Casa Jarocha Boca del Río" });
  await page.getByRole("button", { name: "Generar código" }).click();
  const code = (await page.locator("dialog p.font-display").innerText()).replace(/\s/g, "");
  expect(code).toMatch(/^\d{6}$/);

  const tablet = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const t = await tablet.newPage();
  await t.goto("/kiosk");
  await expect(t.getByRole("heading", { name: "Vincular tablet" })).toBeVisible();

  // Código incorrecto
  for (const d of "000000") await t.getByRole("button", { name: d, exact: true }).click();
  await t.getByRole("button", { name: "Vincular" }).click();
  await expect(t.getByText(/Código incorrecto/)).toBeVisible();

  for (const d of code) await t.getByRole("button", { name: d, exact: true }).click();
  await t.getByRole("button", { name: "Vincular" }).click();
  await expect(t.getByText("Toca para comenzar")).toBeVisible();

  // Ciclo en línea
  await t.getByRole("button", { name: /Toca para comenzar/ }).click();
  await answerBaseSurvey(t, { service: 1, nps: 3 });
  await t.getByRole("button", { name: "Terminar" }).click();
  await expect(t.getByText("Toca para comenzar")).toBeVisible();

  // Sin internet: la respuesta queda en cola y el comensal no ve error.
  await tablet.setOffline(true);
  await t.getByRole("button", { name: /Toca para comenzar/ }).click();
  await answerBaseSurvey(t);
  await t.getByRole("button", { name: "Terminar" }).click();
  await expect(t.getByText(/1 por enviar/)).toBeVisible();

  await tablet.setOffline(false);
  await t.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(t.getByText(/por enviar/)).toHaveCount(0, { timeout: 10_000 });

  // Si se publica otra versión mientras la tablet espera, el siguiente comensal ya ve la nueva.
  await page.goto("/admin/surveys?restaurant=all");
  const boca = page.locator("section").filter({ has: page.getByRole("heading", { name: "Casa Jarocha Boca del Río" }) });
  await boca.getByRole("link", { name: "Experiencia en restaurante" }).first().click();
  await page.getByRole("button", { name: "Duplicar" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Crear borrador/ })
    .click();
  await page.waitForURL(/\/admin\/surveys\/[0-9a-f-]{36}$/);
  await page.getByLabel("Texto de la pregunta 1").fill("¿Primera vez en Casa Jarocha?");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados.")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Encuesta publicada")).toBeVisible();
  await t.getByRole("button", { name: /Toca para comenzar/ }).click();
  await expect(t.getByRole("heading", { name: "¿Primera vez en Casa Jarocha?" })).toBeVisible();
  await t.reload();

  // Menú del personal: mantener presionada la esquina y escribir el PIN.
  await t.mouse.move(20, 20);
  await t.mouse.down();
  await t.waitForTimeout(3300);
  await t.mouse.up();
  for (const d of "9999") await t.getByRole("button", { name: d, exact: true }).click();
  await t.getByRole("button", { name: "Entrar" }).click();
  await expect(t.getByText("PIN incorrecto")).toBeVisible();
  for (const d of "1234") await t.getByRole("button", { name: d, exact: true }).click();
  await t.getByRole("button", { name: "Entrar" }).click();
  await expect(t.getByRole("heading", { name: "Menú del personal" })).toBeVisible();
  await expect(t.getByText("Tablet E2E")).toBeVisible();
  await t.getByRole("button", { name: "Cerrar" }).click();

  // Ambas respuestas llegaron al panel con el nombre de la tablet.
  await page.goto("/admin/responses?channel=KIOSK");
  await expect(page.getByRole("row").filter({ hasText: "Tablet E2E" })).toHaveCount(2);

  // Desvincular desde el panel devuelve la tablet a la pantalla de código.
  await page.goto("/admin/devices");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("row").filter({ hasText: "Tablet E2E" }).getByRole("button", { name: "Desvincular" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Tablet E2E" }).getByText("Sin vincular")).toBeVisible();
  await t.reload();
  await expect(t.getByRole("heading", { name: "Vincular tablet" })).toBeVisible({ timeout: 10_000 });
});

test("regresión QA 3: eliminar una tablet conserva su nombre en las respuestas", async ({ page }) => {
  await login(page);
  await page.goto("/admin/devices");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("row").filter({ hasText: "Tablet E2E" }).getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Tablet E2E" })).toHaveCount(0);
  await page.goto("/admin/responses?channel=KIOSK&restaurant=all");
  await expect(page.getByRole("row").filter({ hasText: "Tablet E2E" }).first()).toBeVisible();
});
