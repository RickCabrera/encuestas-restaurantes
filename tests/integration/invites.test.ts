import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { signupInvites, userRestaurants, users } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { createInvite, findUsableInvite, inviteLink, registerWithInvite } from "@/lib/invites";
import { createOrg, createRestaurantWithSurvey, resetDb } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await createOrg("Cadena")).id;
});
afterAll(async () => {
  await resetDb();
});

const person = (n = 1) => ({ name: `Cliente ${n}`, email: `cliente${n}@ejemplo.com`, password: "Secreta12345" });

async function userCount() {
  const [{ n }] = await db.select({ n: count() }).from(users);
  return n;
}

describe("invitaciones de registro", () => {
  it("el token es de 32 bytes en base64url, vence en 7 días y en la base solo queda su hash", async () => {
    const before = Date.now();
    const { id, token, expiresAt } = await createInvite({ organizationId: orgId });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    const row = await db.query.signupInvites.findFirst({ where: eq(signupInvites.id, id) });
    expect(row).toMatchObject({
      tokenHash: sha256(token),
      kind: "USER",
      organizationId: orgId,
      role: "ADMIN",
      restaurantIds: [],
      usedAt: null,
    });
    expect(JSON.stringify(row)).not.toContain(token);
    const days = (expiresAt.getTime() - before) / (24 * 3600 * 1000);
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(inviteLink("https://ejemplo.com/", token)).toBe(`https://ejemplo.com/registro?codigo=${token}`);
  });

  it("un código válido crea el usuario con el rol de la invitación y la marca como usada", async () => {
    const { id, token } = await createInvite({ organizationId: orgId });
    const r = await registerWithInvite({ token, ...person(), email: "  Cliente1@Ejemplo.com " });
    expect(r.ok).toBe(true);
    const user = await db.query.users.findFirst({ where: eq(users.email, "cliente1@ejemplo.com") });
    expect(user).toMatchObject({ name: "Cliente 1", role: "ADMIN", active: true, organizationId: orgId });
    expect(await bcrypt.compare("Secreta12345", user!.passwordHash)).toBe(true);
    const invite = await db.query.signupInvites.findFirst({ where: eq(signupInvites.id, id) });
    expect(invite?.usedByUserId).toBe(user!.id);
    expect(invite?.usedAt).toBeInstanceOf(Date);
    expect(await findUsableInvite(token)).toBeNull();
  });

  it("una invitación de gerente asigna sus restaurantes", async () => {
    const a = await createRestaurantWithSurvey("a", "ACTIVE", orgId);
    await createRestaurantWithSurvey("b", "ACTIVE", orgId);
    // Un restaurante de otra cadena en la invitación no se asigna, aunque exista.
    const other = await createRestaurantWithSurvey("c", "ACTIVE", (await createOrg("Otra")).id);
    const { token } = await createInvite({
      organizationId: orgId,
      role: "MANAGER",
      restaurantIds: [a.restaurant.id, other.restaurant.id],
    });
    const r = await registerWithInvite({ token, ...person() });
    if (!r.ok) throw new Error("debió registrarse");
    expect(r.user).toMatchObject({ role: "MANAGER", organizationId: orgId });
    const assigned = await db.select().from(userRestaurants).where(eq(userRestaurants.userId, r.user.id));
    expect(assigned.map((x) => x.restaurantId)).toEqual([a.restaurant.id]);
  });

  it("rechaza un código usado, vencido, cancelado o inventado", async () => {
    const used = await createInvite({ organizationId: orgId });
    expect((await registerWithInvite({ token: used.token, ...person(1) })).ok).toBe(true);
    expect(await registerWithInvite({ token: used.token, ...person(2) })).toEqual({ ok: false, reason: "invalid" });

    const expired = await createInvite({ organizationId: orgId });
    await db
      .update(signupInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(signupInvites.id, expired.id));
    expect(await findUsableInvite(expired.token)).toBeNull();
    expect(await registerWithInvite({ token: expired.token, ...person(3) })).toEqual({ ok: false, reason: "invalid" });

    const cancelled = await createInvite({ organizationId: orgId });
    await db.delete(signupInvites).where(eq(signupInvites.id, cancelled.id));
    expect(await registerWithInvite({ token: cancelled.token, ...person(4) })).toEqual({ ok: false, reason: "invalid" });

    for (const token of ["", "abc", "x".repeat(43), `${used.token}x`]) {
      expect(await findUsableInvite(token)).toBeNull();
      expect(await registerWithInvite({ token, ...person(5) })).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await userCount()).toBe(1);
  });

  it("rechaza un correo que ya existe y deja la invitación sin usar", async () => {
    const first = await createInvite({ organizationId: orgId });
    await registerWithInvite({ token: first.token, ...person() });
    const second = await createInvite({ organizationId: orgId });
    const r = await registerWithInvite({ token: second.token, ...person(), email: "CLIENTE1@ejemplo.com" });
    expect(r).toEqual({ ok: false, reason: "email" });
    expect(await userCount()).toBe(1);
    // Puede reintentar con otro correo.
    expect(await findUsableInvite(second.token)).not.toBeNull();
    expect((await registerWithInvite({ token: second.token, ...person(2) })).ok).toBe(true);
  });

  it("dos registros simultáneos con el mismo código crean un solo usuario", async () => {
    const { id, token } = await createInvite({ organizationId: orgId });
    const results = await Promise.all([1, 2, 3, 4].map((n) => registerWithInvite({ token, ...person(n) })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "invalid")).toHaveLength(3);
    expect(await userCount()).toBe(1);
    const winner = results.find((r) => r.ok);
    const invite = await db.query.signupInvites.findFirst({ where: eq(signupInvites.id, id) });
    expect(winner?.ok && winner.user.id).toBe(invite?.usedByUserId);
  });
});
