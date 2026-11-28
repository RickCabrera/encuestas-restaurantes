import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { initialState } from "@/lib/action-state";
import { createOrg, createRestaurantWithSurvey, createUser, resetDb, sessionFor } from "./helpers";

const ctx = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(public url: string) {
      super(`redirect:${url}`);
    }
  }
  return { user: null as unknown, destroyed: 0, Redirect };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new ctx.Redirect(url);
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof ctx.Redirect) throw e;
  },
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!ctx.user) throw new ctx.Redirect("/login");
    return ctx.user;
  },
  createSession: async () => {},
  destroySession: async () => {
    ctx.destroyed++;
  },
}));

const { deleteAccountAction } = await import("@/app/actions/auth");

const form = (password: string) => {
  const fd = new FormData();
  fd.set("password", password);
  return fd;
};

beforeEach(async () => {
  await resetDb();
  ctx.user = null;
  ctx.destroyed = 0;
});
afterAll(resetDb);

describe("Eliminar mi cuenta", () => {
  it("pide la contraseña correcta", async () => {
    const org = await createOrg("C");
    const u = await createUser(org.id, "gerente@c.test", "MANAGER");
    ctx.user = await sessionFor(u.id);
    const r = await deleteAccountAction(initialState, form("otra"));
    expect(r.fieldErrors?.password).toBeTruthy();
    expect(await db.query.users.findFirst({ where: eq(s.users.id, u.id) })).toBeTruthy();
  });

  it("borra al usuario, cierra la sesión y conserva los datos de la cadena", async () => {
    const org = await createOrg("C");
    const { restaurant } = await createRestaurantWithSurvey("uno", "ACTIVE", org.id);
    await createUser(org.id, "admin@c.test", "ADMIN");
    const u = await createUser(org.id, "gerente@c.test", "MANAGER", { restaurantIds: [restaurant.id] });
    await db.insert(s.loyaltyTransactions).values({
      restaurantId: restaurant.id,
      phone: "5512345678",
      kind: "ADJUST",
      points: 5,
      note: "x",
      createdById: u.id,
      createdByName: "gerente",
    });
    ctx.user = await sessionFor(u.id);
    await expect(deleteAccountAction(initialState, form("Secreta12345"))).rejects.toThrow("redirect:/login?eliminada=1");
    expect(ctx.destroyed).toBe(1);
    expect(await db.query.users.findFirst({ where: eq(s.users.id, u.id) })).toBeUndefined();
    expect(await db.query.restaurants.findFirst({ where: eq(s.restaurants.id, restaurant.id) })).toBeTruthy();
    const [tx] = await db.select().from(s.loyaltyTransactions);
    expect(tx).toMatchObject({ createdById: null, createdByName: "gerente" });
  });

  it("el único administrador con más personas en la cadena no puede eliminarse", async () => {
    const org = await createOrg("C");
    const admin = await createUser(org.id, "admin@c.test", "ADMIN");
    await createUser(org.id, "gerente@c.test", "MANAGER");
    ctx.user = await sessionFor(admin.id);
    const r = await deleteAccountAction(initialState, form("Secreta12345"));
    expect(r.error).toMatch(/único administrador/);
    expect(await db.query.users.findFirst({ where: eq(s.users.id, admin.id) })).toBeTruthy();
  });

  it("con otro administrador, o siendo la única persona, sí puede", async () => {
    const org = await createOrg("C");
    const a1 = await createUser(org.id, "a1@c.test", "ADMIN");
    const a2 = await createUser(org.id, "a2@c.test", "ADMIN");
    ctx.user = await sessionFor(a1.id);
    await expect(deleteAccountAction(initialState, form("Secreta12345"))).rejects.toThrow("redirect:");
    ctx.user = await sessionFor(a2.id);
    await expect(deleteAccountAction(initialState, form("Secreta12345"))).rejects.toThrow("redirect:");
    expect(await db.select().from(s.users).where(eq(s.users.organizationId, org.id))).toHaveLength(0);
  });
});
