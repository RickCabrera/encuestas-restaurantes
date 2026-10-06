import { expect, type Page, test } from "@playwright/test";
import { LOCAL } from "../../playwright.local.config";
import { clearRateLimits } from "../e2e/helpers";

test.beforeAll(clearRateLimits);

async function login(page: Page, origin: string) {
  await page.goto(`${origin}/login`);
  await page.getByLabel("Correo").fill("admin@demo.com");
  await page.getByLabel("Contraseña").fill("Admin12345!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(`${origin}/admin`);
}

for (const [name, origin] of [
  ["localhost", LOCAL.localhost],
  ["la IP de la red", LOCAL.lan],
] as const) {
  test(`login y cookie de sesión por ${name}`, async ({ page, context }) => {
    const res = await page.goto(`${origin}/login`);
    expect(res!.headers()["strict-transport-security"]).toBeUndefined();
    await login(page, origin);

    const session = (await context.cookies(origin)).find((c) => c.name === "session")!;
    expect(session.secure).toBe(false);
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe("Lax");

    // La sesión sigue al navegar y al recargar, y la versión instalada se ve en el panel.
    await page.goto(`${origin}/admin/devices`);
    await expect(page.getByRole("heading", { name: "Tablets" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Tablets" })).toBeVisible();
    await expect(page.getByText(`Versión ${LOCAL.version}`).first()).toBeVisible();
  });
}

test("por la IP de la red no hay secure context", async ({ page }) => {
  await page.goto(`${LOCAL.lan}/login`);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.subtle)).toBe("undefined");
  expect(await page.evaluate(() => typeof navigator.clipboard)).toBe("undefined");
});

test("la sesión es por dirección: entrar por localhost no abre sesión por la IP", async ({ page }) => {
  await login(page, LOCAL.localhost);
  await page.goto(`${LOCAL.lan}/admin`);
  await expect(page).toHaveURL(/\/login/);
});

test("Tablets muestra la dirección para las tablets, con la IP, y se puede copiar", async ({ page }) => {
  // Se entra por localhost, como desde el acceso directo de la PC: la dirección debe ser la de la red.
  await login(page, LOCAL.localhost);
  await page.goto(`${LOCAL.localhost}/admin/devices`);
  await expect(page.getByLabel("Dirección para las tablets")).toHaveValue(LOCAL.lan);
  await page.getByRole("button", { name: "Copiar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copiado" })).toBeVisible();

  // También por la IP, donde no existe navigator.clipboard.
  await login(page, LOCAL.lan);
  await page.goto(`${LOCAL.lan}/admin/devices`);
  await page.getByRole("button", { name: "Copiar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copiado" })).toBeVisible();
});

test("/inicio: solo desde la propia PC y con la llave", async ({ request }) => {
  const get = (url: string, headers?: Record<string, string>) => request.get(url, { maxRedirects: 0, headers });
  const withKey = `/inicio?llave=${LOCAL.setupKey}`;

  // La base de E2E ya tiene usuarios: el acceso directo lleva al login.
  const ok = await get(`${LOCAL.localhost}${withKey}`);
  expect(ok.status()).toBe(307);
  expect(ok.headers()["location"]).toBe("/login");

  expect((await get(`${LOCAL.localhost}/inicio`)).status()).toBe(404);
  expect((await get(`${LOCAL.localhost}/inicio?llave=${"x".repeat(52)}`)).status()).toBe(404);
  // Por la IP de la red la conexión no llega por loopback, traiga lo que traiga.
  expect((await get(`${LOCAL.lan}${withKey}`)).status()).toBe(404);
  expect((await get(`${LOCAL.lan}${withKey}`, { "X-Forwarded-For": "127.0.0.1" })).status()).toBe(404);
});

test("/api/health responde igual que en nube", async ({ request }) => {
  for (const origin of [LOCAL.localhost, LOCAL.lan]) {
    const res = await request.get(`${origin}/api/health`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  }
});
