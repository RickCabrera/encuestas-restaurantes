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

/**
 * Crea directo en la BD de E2E otra cadena con un restaurante (sin encuesta publicada) y una
 * tablet esperando código. Devuelve el código de 6 dígitos y el id de la tablet.
 */
export async function otherChainPairingCode(chain: string) {
  const sql = postgres(process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/encuestas_e2e", { max: 1 });
  try {
    const [org] = await sql`INSERT INTO organizations (name) VALUES (${chain}) RETURNING id`;
    const slug = `traspaso-${Date.now()}`;
    const [restaurant] = await sql`
      INSERT INTO restaurants (organization_id, name, slug, kiosk_pin_hash)
      VALUES (${org.id}, ${`Sucursal ${chain}`}, ${slug}, 'sin-pin') RETURNING id`;
    let code = "";
    for (;;) {
      code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
      const used = await sql`SELECT 1 FROM devices WHERE pairing_code = ${code}`;
      if (used.length === 0) break;
    }
    const [device] = await sql`
      INSERT INTO devices (restaurant_id, name, pairing_code, pairing_expires_at)
      VALUES (${restaurant.id}, 'Tablet traspasada', ${code}, now() + interval '15 minutes') RETURNING id`;
    return { code, deviceId: device.id as string };
  } finally {
    await sql.end();
  }
}

/** Token (su hash) con el que está vinculada una tablet, o null si no lo está. */
export async function deviceTokenHash(deviceId: string) {
  const sql = postgres(process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/encuestas_e2e", { max: 1 });
  try {
    const [row] = await sql`SELECT token_hash FROM devices WHERE id = ${deviceId}`;
    return (row?.token_hash as string | null) ?? null;
  } finally {
    await sql.end();
  }
}
