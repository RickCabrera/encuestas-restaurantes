import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { accentPreset, DEFAULT_ACCENT } from "./ui-theme";

/** Llaves de app_settings que usa la Administración. */
export const SETTING_ACCENT = "ui_accent";

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: sql`now()` } });
}

/**
 * Color de acento guardado. Se lee en cada carga de /theme.css (una consulta mínima por la llave
 * primaria): sin caché en memoria, para que el cambio se vea al recargar en cualquier instancia.
 */
export async function getAccent(): Promise<string> {
  try {
    return accentPreset(await getSetting(SETTING_ACCENT)).id;
  } catch {
    // Sin base (p. ej. arrancando) se usa el color de fábrica; la página no debe fallar por esto.
    return DEFAULT_ACCENT;
  }
}

export async function setAccent(id: string) {
  await setSetting(SETTING_ACCENT, accentPreset(id).id);
}
