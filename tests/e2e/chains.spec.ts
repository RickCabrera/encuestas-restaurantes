import { execSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { clearRateLimits, login } from "./helpers";

test.beforeAll(clearRateLimits);

const CHAIN = "Tacos El Güero E2E";
const RESTAURANT = "Taquería Portales";
const OWNER = { name: "Dueña Tacos", email: "duena@tacos-e2e.test", password: "DuenaTacos123!" };
const MANAGER = { name: "Gerente Tacos", email: "gerente@tacos-e2e.test", password: "GerenteTacos123!" };
const INVALID = "Este enlace no es válido o ya fue usado. Pide uno nuevo.";
const NOT_FOUND = "No encontramos lo que buscas";

/** Corre `npm run invite:org` contra la BD de E2E, como se haría en una terminal, y devuelve el enlace que imprime. */
function inviteOrg(baseURL: string) {
  const out = execSync("npm run invite:org", {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/encuestas_e2e",
      APP_URL: baseURL,
    },
  });
  const link = /https?:\/\/\S+\/registro\?codigo=[A-Za-z0-9_-]{43}/.exec(out)?.[0];
  if (!link) throw new Error(`invite:org no imprimió un enlace:\n${out}`);
  return link;
}

async function fillAccount(page: Page, who: typeof OWNER) {
  await page.getByLabel("Nombre", { exact: true }).fill(who.name);
  await page.getByLabel("Correo").fill(who.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(who.password);
  await page.getByLabel("Confirmar contraseña").fill(who.password);
}

/** La barra lateral muestra, arriba, la cadena de quien tiene la sesión. */
async function expectChain(page: Page, name: string) {
  await expect(page.locator("aside").getByText(name, { exact: true })).toBeVisible();
}

/** El id al final del enlace a una ficha, tomado de su listado. */
async function idOf(page: Page, listPath: string, linkName: string) {
  await page.goto(listPath);
  const href = await page.getByRole("link", { name: linkName }).first().getAttribute("href");
  const id = href?.split("/").pop()?.split("?")[0];
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id!;
}

/** Abrir por URL algo de otra cadena da "no encontrado", nunca sus datos. */
async function expectNotFound(page: Page, path: string, leaks: string[]) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(404);
  await expect(page.getByText(NOT_FOUND), path).toBeVisible();
  for (const text of leaks) await expect(page.getByText(text), `${path} no debe mostrar "${text}"`).toHaveCount(0);
}

test("cadena nueva: invite:org → registro → cadena vacía → restaurante → gerente, aislada de Demo en ambos sentidos", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);

  // ── invite:org: cada ejecución da un enlace distinto ──
  const link = inviteOrg(baseURL!);
  const spare = inviteOrg(baseURL!);
  expect(spare).not.toBe(link);

  // ── Registro: con este tipo de enlace se pide además el nombre de la cadena ──
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
  const chainField = page.getByLabel("Nombre de tu cadena o negocio");
  await expect(chainField).toBeVisible();
  await fillAccount(page, OWNER);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText(/Escribe el nombre de tu cadena o negocio/)).toBeVisible();
  // No se puede fundar otra "Demo".
  await chainField.fill("demo");
  await page.getByLabel("Contraseña", { exact: true }).fill(OWNER.password);
  await page.getByLabel("Confirmar contraseña").fill(OWNER.password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Ese nombre no está disponible. Elige otro.")).toBeVisible();
  await chainField.fill(CHAIN);
  await page.getByLabel("Contraseña", { exact: true }).fill(OWNER.password);
  await page.getByLabel("Confirmar contraseña").fill(OWNER.password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  // ── Queda con sesión, en /admin, como administradora de una cadena vacía ──
  await expect(page).toHaveURL(/\/admin$/);
  await expectChain(page, CHAIN);
  await expect(page.getByRole("heading", { name: "Empieza creando tu primer restaurante" })).toBeVisible();
  const createFirst = page.getByRole("link", { name: "Crear restaurante" });
  await expect(createFirst).toBeVisible();
  await expect(page.getByRole("link", { name: "Usuarios" })).toBeVisible();

  // Ninguna pantalla falla por no tener datos, y ninguna enseña los de Demo.
  const emptyScreens: [string, string][] = [
    ["/admin", "Empieza creando tu primer restaurante"],
    ["/admin/responses", "Respuestas"],
    ["/admin/responses?low=1&from=2020-01-01", "Respuestas"],
    ["/admin/comments", "Comentarios"],
    ["/admin/comments?q=fria", "Comentarios"],
    ["/admin/surveys", "Encuestas"],
    ["/admin/surveys/new", "Nueva encuesta"],
    ["/admin/restaurants", "Aún no hay restaurantes"],
    ["/admin/devices", "Aún no hay tablets"],
    ["/admin/users", OWNER.email],
    ["/admin/users/new", "Agregar usuario"],
    ["/admin/account", OWNER.email],
  ];
  for (const [path, expected] of emptyScreens) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expectChain(page, CHAIN);
    await expect(page.getByText(expected).first(), path).toBeVisible();
    await expect(page.getByText("No se pudo cargar esta sección"), path).toHaveCount(0);
    await expect(page.getByText("Casa Jarocha"), path).toHaveCount(0);
    await expect(page.getByText("admin@demo.com"), path).toHaveCount(0);
  }
  await page.goto("/admin/users");
  await expect(page.getByRole("row")).toHaveCount(2); // encabezado + ella
  const emptyCsv = await page.request.get("/api/export?from=2020-01-01");
  expect(emptyCsv.status()).toBe(200);
  expect((await emptyCsv.text()).trim().split("\r\n")).toHaveLength(1); // solo el encabezado

  // ── Crea su primer restaurante desde el estado inicial ──
  await page.goto("/admin");
  await createFirst.click();
  await expect(page).toHaveURL(/\/admin\/restaurants\/new$/);
  await page.getByLabel("Nombre", { exact: true }).fill(RESTAURANT);
  await expect(page.getByLabel("Dirección de la encuesta")).toHaveValue("taqueria-portales");
  await page.getByLabel("PIN del menú del personal (tablets)").fill("2468");
  await page.getByRole("button", { name: "Crear restaurante" }).click();
  await expect(page.getByText("Restaurante creado")).toBeVisible();
  const newRestaurantId = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Empieza creando tu primer restaurante" })).toHaveCount(0);
  await expect(page.getByRole("combobox").first()).toContainText(RESTAURANT);
  await expect(page.getByRole("combobox").first()).not.toContainText("Casa Jarocha");

  // ── Invita a un gerente con enlace: solo puede elegir restaurantes de su cadena ──
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Invitar con enlace" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Gerente/ }).check();
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await expect(dialog.getByRole("checkbox", { name: /Casa Jarocha/ })).toHaveCount(0);
  await dialog.getByRole("checkbox", { name: RESTAURANT }).check();
  await dialog.getByRole("button", { name: "Generar enlace" }).click();
  const managerLink = await dialog.getByLabel("Enlace de registro").inputValue();
  await dialog.getByRole("button", { name: "Cerrar" }).click();

  // ── El gerente se registra: no se le pide cadena, entra a la de quien lo invitó y ve solo ese restaurante ──
  const managerPage = await (await browser.newContext()).newPage();
  await managerPage.goto(managerLink);
  await expect(managerPage.getByLabel("Nombre de tu cadena o negocio")).toHaveCount(0);
  await fillAccount(managerPage, MANAGER);
  await managerPage.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(managerPage).toHaveURL(/\/admin$/);
  await expectChain(managerPage, CHAIN);
  await expect(managerPage.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
  await expect(managerPage.getByRole("link", { name: "Restaurantes" })).toHaveCount(0);
  const managerSelector = managerPage.getByRole("combobox").first();
  await expect(managerSelector).toContainText(RESTAURANT);
  await expect(managerSelector.getByRole("option")).toHaveCount(1);
  await expect(managerPage.getByText(new RegExp(`^${RESTAURANT}, del `))).toBeVisible();
  // Y entra también por el login normal.
  const managerAgain = await (await browser.newContext()).newPage();
  await login(managerAgain, MANAGER.email, MANAGER.password);
  await expectChain(managerAgain, CHAIN);

  // ── El admin de Demo no ve la cadena nueva ──
  const demo = await (await browser.newContext()).newPage();
  await login(demo);
  await expectChain(demo, "Demo");
  await expect(demo.getByRole("combobox").first()).not.toContainText(RESTAURANT);
  await expect(demo.getByRole("combobox").first()).toContainText("Casa Jarocha Centro");
  for (const path of [
    "/admin/restaurants",
    "/admin/users",
    "/admin/surveys?restaurant=all",
    "/admin/devices",
    "/admin/responses",
  ]) {
    await demo.goto(path);
    for (const text of [RESTAURANT, OWNER.email, MANAGER.email, CHAIN]) {
      await expect(demo.getByText(text), `${path} de Demo no debe mostrar "${text}"`).toHaveCount(0);
    }
  }
  await demo.goto("/admin/users");
  await expect(demo.getByText("admin@demo.com")).toBeVisible();
  // La invitación pendiente del gerente ya se usó, y el enlace de sobra de invite:org no es de ninguna cadena.
  await expect(demo.getByText("Invitaciones pendientes")).toHaveCount(0);
  const ownerId = await idOf(page, "/admin/users", OWNER.name);
  await expectNotFound(demo, `/admin/restaurants/${newRestaurantId}`, [RESTAURANT]);
  await expectNotFound(demo, `/admin/users/${ownerId}`, [OWNER.email]);
  expect((await demo.request.get(`/api/qr/${newRestaurantId}?format=png`)).status()).toBe(404);
  expect(await (await demo.request.get(`/api/export?restaurant=${newRestaurantId}&from=2020-01-01`)).text()).not.toContain(
    RESTAURANT,
  );

  // ── Y viceversa: la cadena nueva no ve nada de Demo, ni con sus ids en la URL ──
  const demoRestaurantId = await idOf(demo, "/admin/restaurants", "Casa Jarocha Centro");
  const demoSurveyId = await idOf(demo, "/admin/surveys?restaurant=all", "Experiencia en restaurante");
  const demoAdminId = await idOf(demo, "/admin/users", "Administrador");
  for (const who of [page, managerPage]) {
    await expectNotFound(who, `/admin/surveys/${demoSurveyId}`, ["Experiencia en restaurante", "Casa Jarocha"]);
    await expectNotFound(who, `/admin/surveys/${demoSurveyId}/preview`, ["Casa Jarocha"]);
    await expectNotFound(who, `/admin/surveys/${demoSurveyId}/results`, ["Casa Jarocha"]);
    expect((await who.request.get(`/api/qr/${demoRestaurantId}?format=png`)).status()).toBe(404);
    expect((await who.request.get(`/api/qr/${demoRestaurantId}?format=pdf`)).status()).toBe(404);
    const csv = await (
      await who.request.get(`/api/export?restaurant=${demoRestaurantId}&survey=${demoSurveyId}&from=2020-01-01`)
    ).text();
    expect(csv).not.toContain("Casa Jarocha");
    await who.goto(`/admin?restaurant=${demoRestaurantId}`);
    await expect(who.getByText("Casa Jarocha")).toHaveCount(0);
    await who.goto(`/admin/responses?restaurant=${demoRestaurantId}&from=2020-01-01`);
    await expect(who.getByText("Casa Jarocha")).toHaveCount(0);
  }
  await expectNotFound(page, `/admin/restaurants/${demoRestaurantId}`, ["Casa Jarocha"]);
  await expectNotFound(page, `/admin/users/${demoAdminId}`, ["admin@demo.com"]);
  // Una respuesta de Demo (las crean las pruebas anteriores) tampoco se abre desde la otra cadena.
  await demo.goto("/admin/responses?from=2020-01-01&restaurant=all");
  const demoResponse = demo.locator('a[href^="/admin/responses/"]').first();
  if ((await demoResponse.count()) > 0) {
    const href = (await demoResponse.getAttribute("href"))!;
    await expectNotFound(page, href, ["Casa Jarocha"]);
    await expectNotFound(managerPage, href, ["Casa Jarocha"]);
  }
  // Las listas de la cadena nueva tienen solo lo suyo.
  await page.goto("/admin/users");
  await expect(page.getByRole("row")).toHaveCount(3); // encabezado + dueña + gerente
  await expect(page.getByRole("row").filter({ hasText: MANAGER.email })).toContainText(RESTAURANT);
  await page.goto("/admin/restaurants");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.goto("/admin/surveys/new");
  await expect(page.getByText("Casa Jarocha")).toHaveCount(0);

  // ── El enlace de cadena ya usado no sirve otra vez; el de sobra sigue vigente hasta que se use ──
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(link);
  await expect(guest.getByText(INVALID)).toBeVisible();
  await expect(guest.getByRole("textbox")).toHaveCount(0);
  await guest.goto(spare);
  await expect(guest.getByLabel("Nombre de tu cadena o negocio")).toBeVisible();
});
