"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth";
import { kioskPinHash } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { SLUG_REGEX, slugify } from "@/lib/slug";

const MAX_LOGO_BYTES = 512 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

const baseSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(60)
    .optional()
    .transform((v) => v ?? ""),
  address: z.string().trim().max(200).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
    .default("#2F6B4F"),
  kioskResetSeconds: z.coerce.number().int().min(3, "Mínimo 3 s").max(60, "Máximo 60 s"),
  kioskIdleSeconds: z.coerce.number().int().min(15, "Mínimo 15 s").max(600, "Máximo 600 s"),
});

const pinSchema = z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 dígitos");

async function readLogo(formData: FormData): Promise<{ data: Buffer; mime: string } | { error: string } | null> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return null;
  if (!LOGO_TYPES.includes(file.type)) return { error: "El logo debe ser PNG, JPG o WebP" };
  if (file.size > MAX_LOGO_BYTES) return { error: "El logo debe pesar menos de 512 KB" };
  return { data: Buffer.from(await file.arrayBuffer()), mime: file.type };
}

async function slugTaken(slug: string, exceptId?: string) {
  const row = await db.query.restaurants.findFirst({
    where: exceptId ? and(eq(restaurants.slug, slug), ne(restaurants.id, exceptId)) : eq(restaurants.slug, slug),
    columns: { id: true },
  });
  return !!row;
}

function parse(formData: FormData) {
  return baseSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    address: formData.get("address") || undefined,
    primaryColor: formData.get("primaryColor") || undefined,
    kioskResetSeconds: formData.get("kioskResetSeconds"),
    kioskIdleSeconds: formData.get("kioskIdleSeconds"),
  });
}

export async function createRestaurantAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parse(formData);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const pin = pinSchema.safeParse(formData.get("kioskPin"));
  if (!pin.success) return { fieldErrors: { kioskPin: [pin.error.issues[0].message] } };

  const slug = parsed.data.slug || slugify(parsed.data.name);
  if (!SLUG_REGEX.test(slug)) return { fieldErrors: { slug: ["Usa solo minúsculas, números y guiones"] } };
  if (await slugTaken(slug)) return { fieldErrors: { slug: ["Ya existe un restaurante con esa dirección"] } };

  const logo = await readLogo(formData);
  if (logo && "error" in logo) return { fieldErrors: { logo: [logo.error] } };

  const id = randomUUID();
  await db.insert(restaurants).values({
    id,
    ...parsed.data,
    address: parsed.data.address || null,
    slug,
    kioskPinHash: kioskPinHash(id, pin.data),
    ...(logo ? { logoData: logo.data, logoMime: logo.mime, logoUpdatedAt: new Date() } : {}),
  });
  logger.info("restaurant.created", { restaurantId: id });
  revalidatePath("/admin", "layout");
  redirect(`/admin/restaurants/${id}?created=1`);
}

export async function updateRestaurantAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parse(formData);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const slug = parsed.data.slug || slugify(parsed.data.name);
  if (!SLUG_REGEX.test(slug)) return { fieldErrors: { slug: ["Usa solo minúsculas, números y guiones"] } };
  if (await slugTaken(slug, id)) return { fieldErrors: { slug: ["Ya existe un restaurante con esa dirección"] } };

  const pinRaw = String(formData.get("kioskPin") ?? "").trim();
  let pinUpdate = {};
  if (pinRaw) {
    const pin = pinSchema.safeParse(pinRaw);
    if (!pin.success) return { fieldErrors: { kioskPin: [pin.error.issues[0].message] } };
    pinUpdate = { kioskPinHash: kioskPinHash(id, pin.data) };
  }

  const logo = await readLogo(formData);
  if (logo && "error" in logo) return { fieldErrors: { logo: [logo.error] } };
  const removeLogo = formData.get("removeLogo") === "on";

  await db
    .update(restaurants)
    .set({
      ...parsed.data,
      address: parsed.data.address || null,
      slug,
      ...pinUpdate,
      ...(logo
        ? { logoData: logo.data, logoMime: logo.mime, logoUpdatedAt: new Date() }
        : removeLogo
          ? { logoData: null, logoMime: null, logoUpdatedAt: new Date() }
          : {}),
    })
    .where(eq(restaurants.id, id));
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Cambios guardados." };
}

/** Desactivar en lugar de borrar: se conservan encuestas y respuestas. */
export async function setRestaurantActiveAction(id: string, active: boolean) {
  await requireAdmin();
  await db.update(restaurants).set({ active }).where(eq(restaurants.id, id));
  logger.info("restaurant.active_changed", { restaurantId: id, active });
  revalidatePath("/admin", "layout");
}
