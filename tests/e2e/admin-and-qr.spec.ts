import { expect, test } from "@playwright/test";
import { answerBaseSurvey, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("admin: crea restaurante, crea encuesta desde plantilla y la publica", async ({ page, browser }) => {
  await login(page);
  await page.goto("/admin/restaurants/new");
  await page.getByLabel("Nombre").fill("Sucursal Pruebas E2E");
  await expect(page.getByLabel("Dirección de la encuesta")).toHaveValue("sucursal-pruebas-e2e");
  await page.getByLabel("PIN del menú del personal (tablets)").fill("4321");
  await page.getByRole("button", { name: "Crear restaurante" }).click();
  await expect(page.getByText("Restaurante creado")).toBeVisible();

  // Sin encuesta activa, la página pública lo dice.
  const guest = await browser.newPage();
  await guest.goto("/r/sucursal-pruebas-e2e");
  await expect(guest.getByRole("heading", { name: "Encuesta no disponible" })).toBeVisible();

  await page.getByRole("link", { name: "Crear encuesta" }).click();
  await page.getByLabel("Título").fill("Encuesta E2E");
  await page.getByRole("button", { name: "Crear borrador" }).click();
  await expect(page.getByRole("heading", { name: "Encuesta E2E" })).toBeVisible();
  await expect(page.getByText("Borrador", { exact: true })).toBeVisible();

  // Edita: cambia el mensaje final y guarda.
  await page.getByLabel("Mensaje final").fill("¡Vuelva pronto! Gracias");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados.")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Encuesta publicada")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Activa", { exact: true })).toBeVisible();

  await guest.goto("/r/sucursal-pruebas-e2e");
  await guest.getByRole("button", { name: "Comenzar" }).click();
  await answerBaseSurvey(guest, { comment: "Prueba de punta a punta" });
  await expect(guest.getByText("¡Vuelva pronto! Gracias")).toBeVisible();

  // Con respuestas ya no se puede editar.
  await page.reload();
  await expect(page.getByText(/ya tiene 1 respuesta,/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
});

test("QR por mesa: la respuesta llega al panel con el número de mesa", async ({ page, browser }) => {
  const guest = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await guest.goto("/r/centro?mesa=7");
  await guest.getByRole("button", { name: "Comenzar" }).click();
  await answerBaseSurvey(guest, { food: 2, comment: "La sopa llegó fría" });

  // El mismo navegador no puede reenviar de inmediato.
  await guest.goto("/r/centro?mesa=7");
  await expect(guest.getByText("Ya recibimos tu respuesta")).toBeVisible();

  await login(page);
  await page.goto("/admin/responses?table=7");
  const row = page.getByRole("row").filter({ hasText: "QR, mesa 7" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Baja")).toBeVisible();
  await page.goto("/admin/comments?low=1");
  await expect(page.getByText("La sopa llegó fría")).toBeVisible();
});

test("exporta CSV con BOM y columnas por pregunta", async ({ page }) => {
  await login(page);
  const res = await page.request.get("/api/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.text();
  expect(body.charCodeAt(0)).toBe(0xfeff);
  expect(body).toContain("¿Qué calificación le das a nuestros alimentos?");
  expect(body).toContain("La sopa llegó fría");
});

test("QR descargable en PNG y PDF", async ({ page }) => {
  await login(page);
  await page.goto("/admin/restaurants");
  await page.getByRole("link", { name: "Casa Jarocha Centro" }).click();
  await page.waitForURL(/\/admin\/restaurants\/[0-9a-f-]{36}/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const png = await page.request.get(`/api/qr/${id}?format=png`);
  expect(png.headers()["content-type"]).toBe("image/png");
  const pdf = await page.request.get(`/api/qr/${id}?format=pdf&tables=1-8`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("regresión QA: resultados por pregunta cargan con datos y el buscador ignora acentos", async ({ page }) => {
  await login(page);
  await page.goto("/admin/surveys");
  // Encuesta activa de Centro (tiene la respuesta del QR de mesa 7).
  await page.getByRole("heading", { name: "Casa Jarocha Centro" }).waitFor();
  const centro = page.locator("section").filter({ has: page.getByRole("heading", { name: "Casa Jarocha Centro" }) });
  await centro.getByRole("link", { name: "Experiencia en restaurante" }).first().click();
  await page.getByRole("link", { name: /^Resultados/ }).click();
  await expect(page.getByRole("heading", { name: "Resultados por pregunta" })).toBeVisible();
  await expect(page.getByText("No se pudo cargar esta sección")).toHaveCount(0);
  await expect(page.getByText("promedio de 5").first()).toBeVisible();

  await page.goto("/admin/comments?q=fria");
  await expect(page.getByText("La sopa llegó fría")).toBeVisible();
});

test("regresión QA: la lista de restaurantes muestra encuesta activa y respuestas reales", async ({ page }) => {
  await login(page);
  await page.goto("/admin/restaurants");
  const row = page.getByRole("row").filter({ hasText: "Casa Jarocha Centro" });
  await expect(row.getByText("Experiencia en restaurante")).toBeVisible();
  await expect(row.getByText("Sin encuesta activa")).toHaveCount(0);
  const responses = Number((await row.locator("td").nth(3).innerText()).replace(/\D/g, ""));
  expect(responses).toBeGreaterThan(0);
});

test("regresión QA: el login regresa a la página pedida y conserva el correo", async ({ page }) => {
  await page.goto("/admin/responses?low=1");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Correo").fill("admin@demo.com");
  await page.getByLabel("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  await expect(page.getByLabel("Correo")).toHaveValue("admin@demo.com");
  await page.getByLabel("Contraseña").fill("Admin12345!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/responses\?low=1$/);
});

test("regresión QA 2: el bloqueo del QR sigue aunque se publique otra versión", async ({ page, browser }) => {
  const guest = await browser.newPage();
  await guest.goto("/r/boca-del-rio");
  await guest.getByRole("button", { name: "Comenzar" }).click();
  await answerBaseSurvey(guest);

  // Publica una versión nueva para Boca del Río.
  await login(page);
  await page.goto("/admin/surveys?restaurant=all");
  const boca = page.locator("section").filter({ has: page.getByRole("heading", { name: "Casa Jarocha Boca del Río" }) });
  await boca.getByRole("link", { name: "Experiencia en restaurante" }).first().click();
  await page.getByRole("button", { name: "Duplicar" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Crear borrador/ })
    .click();
  await page.waitForURL(/\/admin\/surveys\/[0-9a-f-]{36}$/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Encuesta publicada")).toBeVisible();

  await guest.goto("/r/boca-del-rio");
  await expect(guest.getByText("Ya recibimos tu respuesta")).toBeVisible();
});

test("regresión QA 2: el selector en una página de detalle regresa al listado", async ({ page }) => {
  await login(page);
  await page.goto("/admin/surveys?restaurant=all");
  await page.locator("table a").first().click();
  await page.waitForURL(/\/admin\/surveys\/[0-9a-f-]{36}$/);
  await page.getByRole("combobox").first().selectOption({ label: "Casa Jarocha Centro" });
  await expect(page).toHaveURL(/\/admin\/surveys$/);
  // Deja el selector como estaba para las demás pruebas.
  await page.getByRole("combobox").first().selectOption({ label: "Todos los restaurantes" });
});

test("regresión QA 2: un gerente que entra con ?next a una sección de admin va al resumen sin aviso", async ({ page }) => {
  await page.goto("/login?next=%2Fadmin%2Fusers");
  await page.getByLabel("Correo").fill("gerente@demo.com");
  await page.getByLabel("Contraseña").fill("Gerente12345!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Esa sección es solo para administradores.")).toHaveCount(0);
});

test("regresión QA 3: los campos de fecha siguen al botón de periodo", async ({ page }) => {
  await login(page);
  await page.goto("/admin");
  await page.getByRole("link", { name: "Hoy", exact: true }).click();
  await expect(page).toHaveURL(/from=/);
  const from = new URL(page.url()).searchParams.get("from")!;
  await expect(page.getByLabel("Desde")).toHaveValue(from);
  await expect(page.getByLabel("Hasta")).toHaveValue(from);
  await page.getByLabel("Canal").selectOption("QR");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(new RegExp(`from=${from}.*channel=QR|channel=QR.*from=${from}`));
});
