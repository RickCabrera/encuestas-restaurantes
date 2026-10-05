import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { organizations, signupInvites, users } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { createInvite, createOrgInvite, findUsableInvite, registerWithInvite } from "@/lib/invites";
import { buildSessionUser } from "@/lib/session-user";
import { createOrg, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(resetDb);

const person = (n = 1) => ({ name: `Dueña ${n}`, email: `duena${n}@ejemplo.com`, password: "Secreta12345" });

async function totals() {
  const [[o], [u]] = await Promise.all([db.select({ n: count() }).from(organizations), db.select({ n: count() }).from(users)]);
  return { orgs: o.n, users: u.n };
}

describe("registro de cadena nueva (invitación NEW_ORG)", () => {
  it("la invitación no tiene cadena, es de un solo uso por 7 días y cada una trae un enlace distinto", async () => {
    const before = Date.now();
    const a = await createOrgInvite();
    const b = await createOrgInvite();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    const row = await db.query.signupInvites.findFirst({ where: eq(signupInvites.id, a.id) });
    expect(row).toMatchObject({ kind: "NEW_ORG", organizationId: null, role: "ADMIN", tokenHash: sha256(a.token), usedAt: null });
    const days = (a.expiresAt.getTime() - before) / (24 * 3600 * 1000);
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect((await findUsableInvite(a.token))?.kind).toBe("NEW_ORG");
    // Crear invitaciones no crea cadenas.
    expect(await totals()).toEqual({ orgs: 0, users: 0 });
  });

  it("el código crea la cadena y a su administrador, y marca la invitación como usada", async () => {
    const { id, token } = await createOrgInvite();
    const r = await registerWithInvite({ token, ...person(), orgName: "  Tacos El Güero  " });
    if (!r.ok) throw new Error("debió registrarse");
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, r.user.organizationId) });
    expect(org?.name).toBe("Tacos El Güero");
    expect(r.user).toMatchObject({ role: "ADMIN", active: true, notifyLowScores: true, email: "duena1@ejemplo.com" });
    expect(await totals()).toEqual({ orgs: 1, users: 1 });

    const invite = await db.query.signupInvites.findFirst({ where: eq(signupInvites.id, id) });
    expect(invite?.usedByUserId).toBe(r.user.id);
    expect(invite?.usedAt).toBeInstanceOf(Date);

    // Entra a una cadena vacía: sin restaurantes y sin ver nada de nadie más.
    expect(await buildSessionUser(r.user)).toMatchObject({
      organizationId: org!.id,
      organizationName: "Tacos El Güero",
      role: "ADMIN",
      restaurantIds: [],
    });
  });

  it("un código usado ya no sirve: ni crea otra cadena ni otro usuario", async () => {
    const { token } = await createOrgInvite();
    expect((await registerWithInvite({ token, ...person(1), orgName: "Primera" })).ok).toBe(true);
    expect(await findUsableInvite(token)).toBeNull();
    expect(await registerWithInvite({ token, ...person(2), orgName: "Segunda" })).toEqual({ ok: false, reason: "invalid" });
    expect(await totals()).toEqual({ orgs: 1, users: 1 });
    expect((await db.select().from(organizations)).map((o) => o.name)).toEqual(["Primera"]);
  });

  it("un código vencido tampoco sirve", async () => {
    const { id, token } = await createOrgInvite();
    await db
      .update(signupInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(signupInvites.id, id));
    expect(await registerWithInvite({ token, ...person(), orgName: "Tarde" })).toEqual({ ok: false, reason: "invalid" });
    expect(await totals()).toEqual({ orgs: 0, users: 0 });
  });

  it("dos envíos simultáneos con el mismo código crean una sola cadena", async () => {
    const { id, token } = await createOrgInvite();
    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) => registerWithInvite({ token, ...person(n), orgName: `Cadena ${n}` })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "invalid")).toHaveLength(5);
    expect(await totals()).toEqual({ orgs: 1, users: 1 });
    const winner = results.find((r) => r.ok);
    if (!winner?.ok) throw new Error("debió ganar uno");
    const invite = await db.query.signupInvites.findFirst({ where: eq(signupInvites.id, id) });
    expect(invite?.usedByUserId).toBe(winner.user.id);
    // La cadena que quedó es la del que ganó, no una mezcla.
    const [org] = await db.select().from(organizations);
    expect(org.id).toBe(winner.user.organizationId);
    expect(org.name).toBe(`Cadena ${winner.user.name.split(" ")[1]}`);
  });

  it("el mismo envío repetido a la vez (doble clic) tampoco duplica", async () => {
    const { token } = await createOrgInvite();
    const results = await Promise.all([1, 2].map(() => registerWithInvite({ token, ...person(), orgName: "Doble clic" })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await totals()).toEqual({ orgs: 1, users: 1 });
  });

  it("sin nombre de cadena, o con un correo que ya existe, no crea nada y el código sigue sirviendo", async () => {
    const other = await createOrg("Otra cadena");
    const existing = await createInvite({ organizationId: other.id });
    await registerWithInvite({ token: existing.token, ...person(9) });

    const { token } = await createOrgInvite();
    for (const orgName of [undefined, "", "   ", "x", "y".repeat(81)]) {
      expect(await registerWithInvite({ token, ...person(), orgName })).toEqual({ ok: false, reason: "orgName" });
    }
    // "Demo" es la cadena protegida: no se puede fundar otra con ese nombre.
    for (const orgName of ["Demo", " demo ", "DEMO"]) {
      expect(await registerWithInvite({ token, ...person(), orgName })).toEqual({ ok: false, reason: "orgNameTaken" });
    }
    // El correo es único entre todas las cadenas.
    expect(await registerWithInvite({ token, ...person(9), orgName: "Nueva" })).toEqual({ ok: false, reason: "email" });
    expect(await totals()).toEqual({ orgs: 1, users: 1 });

    expect(await findUsableInvite(token)).not.toBeNull();
    expect((await registerWithInvite({ token, ...person(), orgName: "Nueva" })).ok).toBe(true);
    expect(await totals()).toEqual({ orgs: 2, users: 2 });
  });

  it("dos cadenas pueden llamarse igual: son cadenas distintas", async () => {
    const a = await createOrgInvite();
    const b = await createOrgInvite();
    const ra = await registerWithInvite({ token: a.token, ...person(1), orgName: "La Parrilla" });
    const rb = await registerWithInvite({ token: b.token, ...person(2), orgName: "La Parrilla" });
    if (!ra.ok || !rb.ok) throw new Error("debieron registrarse");
    expect(ra.user.organizationId).not.toBe(rb.user.organizationId);
  });

  it("una invitación del panel mete la cuenta a la cadena de quien invitó, aunque mande un nombre de cadena", async () => {
    const org = await createOrg("Cadena existente");
    const { token } = await createInvite({ organizationId: org.id, role: "ADMIN" });
    const r = await registerWithInvite({ token, ...person(), orgName: "Intento de cadena nueva" });
    if (!r.ok) throw new Error("debió registrarse");
    expect(r.user.organizationId).toBe(org.id);
    expect(await totals()).toEqual({ orgs: 1, users: 1 });
  });

  it("la base no acepta una invitación sin cadena que no sea NEW_ORG, ni una NEW_ORG con cadena", async () => {
    const org = await createOrg("Cadena");
    const base = { expiresAt: new Date(Date.now() + 1000) };
    await expect(
      db.insert(signupInvites).values({ ...base, tokenHash: "a", kind: "USER", organizationId: null }),
    ).rejects.toThrow();
    await expect(
      db.insert(signupInvites).values({ ...base, tokenHash: "b", kind: "NEW_ORG", organizationId: org.id }),
    ).rejects.toThrow();
  });
});
