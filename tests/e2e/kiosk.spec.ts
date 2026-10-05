import { expect, type Page, test } from "@playwright/test";
import { answerBaseSurvey, login } from "./helpers";

/** Crea una tablet en el panel y devuelve su código de vinculación. */
async function createDeviceCode(page: Page, name: string) {
  await page.goto("/admin/devices");
  await page.getByRole("button", { name: "Agregar tablet" }).first().click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Restaurante", { exact: true }).selectOption({ label: "Casa Jarocha Boca del Río" });
  await page.getByRole("button", { name: "Generar código" }).click();
  const code = (await page.locator("dialog p.font-display").innerText()).replace(/\s/g, "");
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

const mesaHeading = (t: Page) => t.getByRole("heading", { name: "¿Mesa?" });
const welcome = (t: Page) => t.getByRole("button", { name: /Toca para comenzar/ });

test("tablet: se vincula con código, responde, funciona sin internet y sincroniza", async ({ page, browser }) => {
  await login(page);
  const code = await createDeviceCode(page, "Tablet E2E");

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
  // La pantalla de espera es la del mesero: pide la mesa.
  await expect(mesaHeading(t)).toBeVisible();

  // Ciclo en línea: el mesero escribe la mesa y el comensal recibe la bienvenida.
  await t.getByRole("button", { name: "5", exact: true }).click();
  await t.getByRole("button", { name: "Comenzar" }).click();
  await expect(t.getByText("¿Cómo estuvo todo hoy?")).toBeVisible();
  await expect(t.getByText("Mesa 5", { exact: true })).toBeVisible();
  await welcome(t).click();
  await expect(t.getByText("Mesa 5", { exact: true })).toBeVisible();
  await answerBaseSurvey(t, { service: 1, nps: 3 });
  await t.getByRole("button", { name: "Terminar" }).click();

  // Siguiente comensal: el campo de mesa vuelve vacío y "Sin mesa" deja empezar sin número.
  await expect(mesaHeading(t)).toBeVisible();
  await expect(t.getByLabel("0 dígitos escritos")).toBeVisible();
  await expect(t.getByRole("button", { name: "Comenzar" })).toBeDisabled();
  await t.getByRole("button", { name: "Sin mesa" }).click();
  await welcome(t).click();
  await expect(t.getByText("Pregunta 1 de 6")).toBeVisible();
  await expect(t.getByText(/^Mesa \d/)).toHaveCount(0);
  await answerBaseSurvey(t);
  await t.getByRole("button", { name: "Terminar" }).click();
  await expect(mesaHeading(t)).toBeVisible();

  // Sin internet: la respuesta queda en cola (con su mesa) y el comensal no ve error.
  await tablet.setOffline(true);
  await t.getByRole("button", { name: "3", exact: true }).click();
  await t.getByRole("button", { name: "Comenzar" }).click();
  await expect(t.getByText("Mesa 3", { exact: true })).toBeVisible();
  await welcome(t).click();
  await answerBaseSurvey(t);
  await t.getByRole("button", { name: "Terminar" }).click();
  // El aviso de pendientes se ve en la pantalla de espera.
  await expect(mesaHeading(t)).toBeVisible();
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
  await t.getByRole("button", { name: "Sin mesa" }).click();
  await welcome(t).click();
  await expect(t.getByRole("heading", { name: "¿Primera vez en Casa Jarocha?" })).toBeVisible();
  await t.reload();

  // Menú del personal desde la pantalla de espera: mantener presionada la esquina y escribir el PIN.
  await expect(mesaHeading(t)).toBeVisible();
  await t.mouse.move(20, 20);
  await t.mouse.down();
  await t.waitForTimeout(3300);
  await t.mouse.up();
  const menu = t.getByRole("dialog", { name: "Menú del personal" });
  for (const d of "9999") await menu.getByRole("button", { name: d, exact: true }).click();
  await menu.getByRole("button", { name: "Entrar" }).click();
  await expect(menu.getByText("PIN incorrecto")).toBeVisible();
  for (const d of "1234") await menu.getByRole("button", { name: d, exact: true }).click();
  await menu.getByRole("button", { name: "Entrar" }).click();
  await expect(t.getByRole("heading", { name: "Menú del personal" })).toBeVisible();
  await expect(t.getByText("Tablet E2E")).toBeVisible();
  await t.getByRole("button", { name: "Cerrar" }).click();
  // El PIN no se coló en el campo de la mesa que quedó debajo.
  await expect(t.getByLabel("0 dígitos escritos")).toBeVisible();

  // Las tres respuestas llegaron al panel con el nombre de la tablet; dos de ellas con mesa.
  await page.goto("/admin/responses?channel=KIOSK");
  await expect(page.getByRole("row").filter({ hasText: "Tablet E2E" })).toHaveCount(3);
  await expect(page.getByRole("row").filter({ hasText: /Tablet E2E, mesa/ })).toHaveCount(2);
  // La que se respondió sin internet conserva su mesa.
  await page.goto("/admin/responses?table=3");
  await expect(page.getByRole("row").filter({ hasText: "Tablet E2E, mesa 3" })).toHaveCount(1);
  await page.goto("/admin/responses?table=5");
  const mesa5 = page.getByRole("row").filter({ hasText: "Tablet E2E, mesa 5" });
  await expect(mesa5).toHaveCount(1);
  const csv = await (await page.request.get("/api/export?table=5")).text();
  expect(csv).toContain("Tablet,Tablet E2E,5,");
  await mesa5.getByRole("link").click();
  await expect(page.getByText("Tablet: Tablet E2E, mesa 5")).toBeVisible();

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

test("tablet: el orden es ¿Mesa? → bienvenida → encuesta → de vuelta a ¿Mesa?", async ({ page, browser }) => {
  await login(page);
  const code = await createDeviceCode(page, "Kiosko Orden");
  const tablet = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const t = await tablet.newPage();
  await t.goto("/kiosk");
  for (const d of code) await t.getByRole("button", { name: d, exact: true }).click();
  await t.getByRole("button", { name: "Vincular" }).click();

  // 1. Espera: la pantalla del mesero, sin la bienvenida del comensal.
  await expect(mesaHeading(t)).toBeVisible();
  await expect(t.getByText("Escribe el número de mesa y entrega la tablet al comensal.")).toBeVisible();
  await expect(welcome(t)).toHaveCount(0);

  // 2. Bienvenida para el comensal, con la mesa en una esquina; todavía no hay preguntas.
  await t.getByRole("button", { name: "8", exact: true }).click();
  await t.getByRole("button", { name: "Comenzar" }).click();
  await expect(t.getByText("¿Cómo estuvo todo hoy?")).toBeVisible();
  await expect(welcome(t)).toBeVisible();
  await expect(t.getByText("Mesa 8", { exact: true })).toBeVisible();
  await expect(mesaHeading(t)).toHaveCount(0);
  await expect(t.getByText(/Pregunta 1 de/)).toHaveCount(0);

  // 3. El comensal toca y contesta.
  await welcome(t).click();
  await expect(t.getByText("Pregunta 1 de 6")).toBeVisible();
  await expect(welcome(t)).toHaveCount(0);
  await answerBaseSurvey(t);

  // 4. Al terminar vuelve a ¿Mesa? con el campo vacío.
  await t.getByRole("button", { name: "Terminar" }).click();
  await expect(mesaHeading(t)).toBeVisible();
  await expect(t.getByLabel("0 dígitos escritos")).toBeVisible();
  await expect(t.getByText(/^Mesa \d/)).toHaveCount(0);

  await page.goto("/admin/responses?table=8");
  await expect(page.getByRole("row").filter({ hasText: "Kiosko Orden, mesa 8" })).toHaveCount(1);
});
