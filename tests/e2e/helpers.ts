import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export async function login(page: Page, email = "admin@demo.com", password = "Admin12345!") {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Responde la encuesta base (6 preguntas) con valores dados. */
export async function answerBaseSurvey(
  page: Page,
  opts: { firstVisit?: boolean; food?: number; captain?: boolean; service?: number; nps?: number; comment?: string } = {},
) {
  const { firstVisit = true, food = 5, captain = true, service = 5, nps = 10, comment } = opts;
  await page.getByRole("button", { name: firstVisit ? "Sí" : "No", exact: true }).click();
  await expect(page.getByText("Pregunta 2 de 6")).toBeVisible();
  await page.getByRole("radio", { name: new RegExp(`^${food} de 5`) }).click();
  await expect(page.getByText("Pregunta 3 de 6")).toBeVisible();
  await page.getByRole("button", { name: captain ? "Sí" : "No", exact: true }).click();
  await expect(page.getByText("Pregunta 4 de 6")).toBeVisible();
  await page.getByRole("radio", { name: new RegExp(`^${service} de 5`) }).click();
  await expect(page.getByText("Pregunta 5 de 6")).toBeVisible();
  await page.getByRole("radio", { name: String(nps), exact: true }).click();
  await expect(page.getByText(/Pregunta 6 de 6/)).toBeVisible();
  if (comment) await page.getByRole("textbox").fill(comment);
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("¡Vuelva pronto!")).toBeVisible();
}

/**
 * Borra los contadores de rate limit de la BD de E2E. Toda la suite sale de la misma IP y
 * ya roza el límite de 20 inicios de sesión cada 15 minutos.
 */
export async function clearRateLimits() {
  const sql = postgres(process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/encuestas_e2e", { max: 1 });
  await sql`DELETE FROM rate_limits`;
  await sql.end();
}
