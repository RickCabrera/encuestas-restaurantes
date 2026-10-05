import { expect, type Page, test } from "@playwright/test";
import { clearRateLimits, login } from "./helpers";

test.beforeAll(clearRateLimits);

const INVALID = "Este enlace no es válido o ya fue usado. Pide uno nuevo.";

/** Genera una invitación desde Usuarios y devuelve el enlace que se muestra una sola vez. */
async function createInviteLink(page: Page, opts: { manager?: string } = {}) {
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Invitar con enlace" }).click();
  const dialog = page.getByRole("dialog");
  if (opts.manager) {
    await dialog.getByRole("radio", { name: /Gerente/ }).check();
    // Un gerente necesita al menos un restaurante.
    await dialog.getByRole("button", { name: "Generar enlace" }).click();
    await expect(dialog.getByText("Asigna al menos un restaurante")).toBeVisible();
    await dialog.getByRole("checkbox", { name: opts.manager }).check();
  }
  await dialog.getByRole("button", { name: "Generar enlace" }).click();
  const link = await dialog.getByLabel("Enlace de registro").inputValue();
  expect(link).toMatch(/^http:\/\/localhost:\d+\/registro\?codigo=[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByText(/^Vence el .+\. Sirve para un solo registro\.$/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Copiar" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar" }).click();
  return link;
}

async function expectNoForm(page: Page) {
  await expect(page.getByText(INVALID)).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear cuenta" })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
}

test("registro: sin código o con un código inventado no hay formulario", async ({ page }) => {
  await page.goto("/registro");
  await expect(page).toHaveURL(/\/registro$/); // pública: no manda al login
  await expectNoForm(page);
  await page.goto(`/registro?codigo=${"A".repeat(43)}`);
  await expectNoForm(page);
});

test("registro: el admin invita con enlace, el cliente crea su cuenta y el enlace no sirve dos veces", async ({
  page,
  browser,
}) => {
  await login(page);
  const link = await createInviteLink(page);
  const pending = page.getByRole("region", { name: "Invitaciones pendientes" });
  await expect(pending.getByRole("row").filter({ hasText: "Administrador" })).toHaveCount(1);

  // El cliente abre el enlace en su propio navegador.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();

  // Mismas reglas de contraseña que en Mi cuenta.
  await guest.getByLabel("Nombre").fill("Cliente Maestro");
  await guest.getByLabel("Correo").fill("admin@demo.com");
  await guest.getByLabel("Contraseña", { exact: true }).fill("corta");
  await guest.getByLabel("Confirmar contraseña").fill("otra");
  await guest.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(guest.getByText("Mínimo 8 caracteres", { exact: true })).toBeVisible();
  await expect(guest.getByText("Las contraseñas no coinciden")).toBeVisible();
  await expect(guest.getByLabel("Nombre")).toHaveValue("Cliente Maestro");

  // Un correo que ya existe no consume la invitación.
  await guest.getByLabel("Contraseña", { exact: true }).fill("ClienteMaestro123!");
  await guest.getByLabel("Confirmar contraseña").fill("ClienteMaestro123!");
  await guest.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(guest.getByText("Ya existe una cuenta con ese correo")).toBeVisible();

  await guest.getByLabel("Correo").fill("cliente.maestro@demo.com");
  await guest.getByLabel("Contraseña", { exact: true }).fill("ClienteMaestro123!");
  await guest.getByLabel("Confirmar contraseña").fill("ClienteMaestro123!");
  await guest.getByRole("button", { name: "Crear cuenta" }).click();

  // Queda con sesión iniciada, dentro del panel y como administrador.
  await expect(guest).toHaveURL(/\/admin$/);
  await expect(guest.getByRole("link", { name: "Usuarios" })).toBeVisible();
  await guest.goto("/admin/users");
  await expect(guest.getByRole("row").filter({ hasText: "cliente.maestro@demo.com" })).toContainText("Administrador");
  await expect(guest.getByText("Invitaciones pendientes")).toHaveCount(0);

  // Reabrir el enlace: ya fue usado.
  await guest.goto(link);
  await expectNoForm(guest);
  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await expectNoForm(other);

  // Y la cuenta nueva entra por el login normal.
  await login(other, "cliente.maestro@demo.com", "ClienteMaestro123!");
});

test("registro: invitación de gerente con restaurantes, y cancelar una invitación apaga su enlace", async ({ page, browser }) => {
  await login(page);
  const cancelled = await createInviteLink(page);
  const link = await createInviteLink(page, { manager: "Casa Jarocha Centro" });
  const pending = page.getByRole("region", { name: "Invitaciones pendientes" });
  await expect(pending.getByRole("row").filter({ hasText: "Gerente" })).toContainText("Casa Jarocha Centro");

  page.once("dialog", (d) => d.accept());
  await pending.getByRole("row").filter({ hasText: "Administrador" }).getByRole("button", { name: "Cancelar" }).click();
  await expect(pending.getByRole("row").filter({ hasText: "Administrador" })).toHaveCount(0);

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(cancelled);
  await expectNoForm(guest);

  await guest.goto(link);
  await guest.getByLabel("Nombre").fill("Gerente Invitado");
  await guest.getByLabel("Correo").fill("gerente.invitado@demo.com");
  await guest.getByLabel("Contraseña", { exact: true }).fill("GerenteInvitado123!");
  await guest.getByLabel("Confirmar contraseña").fill("GerenteInvitado123!");
  await guest.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(guest).toHaveURL(/\/admin$/);
  // Es gerente: no ve Usuarios y solo tiene su restaurante.
  await expect(guest.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
  await expect(guest.getByRole("combobox").first()).toContainText("Casa Jarocha Centro");
  await expect(guest.getByRole("combobox").first()).not.toContainText("Boca del Río");

  await page.reload();
  await expect(page.getByText("Invitaciones pendientes")).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "gerente.invitado@demo.com" })).toContainText("Casa Jarocha Centro");
});
