import { spawn } from "node:child_process";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { createOrgInvite, registerWithInvite } from "@/lib/invites";
import {
  countOrganizationData,
  deleteOrganization,
  findOrganizationToDelete,
  getOrCreateDemoOrg,
  ProtectedOrganizationError,
} from "@/lib/orgs";
import { chainFingerprint, type Chain, createOrg, createRestaurantWithSurvey, createUser, resetDb, seedChain } from "./helpers";

let A: Chain;
let B: Chain;

beforeEach(async () => {
  await resetDb();
  A = await seedChain("Cadena A", "aaa");
  B = await seedChain("Cadena B", "bbb");
});
afterAll(resetDb);

const EXPECTED = { restaurants: 2, users: 2, surveys: 3, devices: 1, responses: 3, invites: 1 };

/** Filas totales por tabla en toda la base. */
async function tableCounts() {
  const out: Record<string, number> = {};
  for (const t of [
    "organizations",
    "users",
    "restaurants",
    "user_restaurants",
    "surveys",
    "questions",
    "devices",
    "responses",
    "answers",
    "signup_invites",
  ]) {
    const [r] = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(t)}`);
    out[t] = r.n;
  }
  return out;
}

/** Corre el script real con lo que se "escribe" en la confirmación. */
function runScript(args: string[], typed: string | null) {
  return new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/delete-org.ts", ...args], {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
    if (typed !== null) child.stdin.write(`${typed}\n`);
    child.stdin.end();
  });
}

describe("org:delete (librería)", () => {
  it("cuenta lo que va a borrar", async () => {
    expect(await countOrganizationData(B.org.id)).toEqual(EXPECTED);
    // El enlace NEW_ORG con el que se fundó una cadena cuenta como invitación suya.
    const { token } = await createOrgInvite();
    const r = await registerWithInvite({
      token,
      name: "Dueño",
      email: "dueno@nueva.test",
      password: "Secreta12345",
      orgName: "Nueva",
    });
    if (!r.ok) throw new Error("debió registrarse");
    expect(await countOrganizationData(r.user.organizationId)).toEqual({
      restaurants: 0,
      users: 1,
      surveys: 0,
      devices: 0,
      responses: 0,
      invites: 1,
    });
  });

  it("borra solo esa cadena y todo lo suyo; la otra queda intacta", async () => {
    const fingerprintA = await chainFingerprint(A.org.id);
    const before = await tableCounts();
    await db.insert(s.passwordResetTokens).values({ userId: B.admin.id, tokenHash: "x", expiresAt: new Date() });

    const deleted = await deleteOrganization(B.org.id);
    expect(deleted?.org.name).toBe("Cadena B");
    expect(deleted?.counts).toEqual(EXPECTED);

    // De B no queda ni una fila en ninguna tabla.
    const gone = await chainFingerprint(B.org.id);
    for (const [table, value] of Object.entries(gone)) expect(`${table} ${value.split(":")[0]}`).toBe(`${table} 0`);
    expect(await db.query.users.findFirst({ where: eq(s.users.email, B.admin.email) })).toBeUndefined();
    expect(await db.query.restaurants.findFirst({ where: eq(s.restaurants.slug, "bbb-uno") })).toBeUndefined();
    expect(await db.query.responses.findFirst({ where: eq(s.responses.id, B.responseIds[0]) })).toBeUndefined();
    expect(await db.query.signupInvites.findFirst({ where: eq(s.signupInvites.id, B.invite.id) })).toBeUndefined();
    expect(await db.query.devices.findFirst({ where: eq(s.devices.id, B.device.id) })).toBeUndefined();

    // A no cambió en nada, y en total quedó exactamente la mitad (las dos cadenas eran iguales).
    expect(await chainFingerprint(A.org.id)).toEqual(fingerprintA);
    const after = await tableCounts();
    for (const [table, n] of Object.entries(before)) expect(`${table} ${after[table]}`).toBe(`${table} ${n / 2}`);

    // Repetirlo no hace nada.
    expect(await deleteOrganization(B.org.id)).toBeNull();
    expect(await findOrganizationToDelete({ name: "Cadena B" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("borra también el enlace NEW_ORG con el que se fundó la cadena, y no los de otras", async () => {
    const mine = await createOrgInvite();
    const pending = await createOrgInvite();
    const r = await registerWithInvite({
      token: mine.token,
      name: "Dueño",
      email: "dueno@nueva.test",
      password: "Secreta12345",
      orgName: "Nueva",
    });
    if (!r.ok) throw new Error("debió registrarse");
    await deleteOrganization(r.user.organizationId);
    expect(await db.query.signupInvites.findFirst({ where: eq(s.signupInvites.id, mine.id) })).toBeUndefined();
    // Un enlace de cadena nueva que nadie ha usado no es de ninguna cadena: se queda.
    expect(await db.query.signupInvites.findFirst({ where: eq(s.signupInvites.id, pending.id) })).toBeDefined();
  });

  it('"Demo" no se puede borrar: ni por nombre, ni por id, ni llamando directo a la librería', async () => {
    const demo = await getOrCreateDemoOrg();
    await createRestaurantWithSurvey("demo-centro", "ACTIVE", demo.id);
    await createUser(demo.id, "admin@demo.test", "ADMIN");
    const fingerprint = await chainFingerprint(demo.id);

    expect(await findOrganizationToDelete({ name: "Demo" })).toMatchObject({ ok: false, reason: "protected" });
    expect(await findOrganizationToDelete({ id: demo.id })).toMatchObject({ ok: false, reason: "protected" });
    await expect(deleteOrganization(demo.id)).rejects.toBeInstanceOf(ProtectedOrganizationError);
    // Tampoco una segunda cadena que alguien hubiera nombrado "demo".
    const lower = await createOrg(" demo ");
    await expect(deleteOrganization(lower.id)).rejects.toBeInstanceOf(ProtectedOrganizationError);

    expect(await chainFingerprint(demo.id)).toEqual(fingerprint);
    expect((await getOrCreateDemoOrg()).id).toBe(demo.id);
  });

  it("con dos cadenas del mismo nombre no elige: devuelve sus ids para usar --id", async () => {
    const twin = await seedChain("Cadena B", "ccc");
    const found = await findOrganizationToDelete({ name: "Cadena B" });
    if (found.ok || found.reason !== "ambiguous") throw new Error("debió ser ambiguo");
    expect(found.matches.map((o) => o.id).sort()).toEqual([B.org.id, twin.org.id].sort());

    // Con el id se borra justo esa y la gemela queda intacta.
    const fingerprintB = await chainFingerprint(B.org.id);
    const byId = await findOrganizationToDelete({ id: twin.org.id });
    if (!byId.ok) throw new Error("debió encontrarla");
    await deleteOrganization(byId.org.id);
    expect(await chainFingerprint(B.org.id)).toEqual(fingerprintB);
    expect(await findOrganizationToDelete({ name: "Cadena B" })).toMatchObject({ ok: true, org: { id: B.org.id } });
  });

  it("el nombre debe ser exacto", async () => {
    for (const name of ["cadena b", "Cadena", "Cadena B ", "%", ""]) {
      expect(await findOrganizationToDelete({ name })).toEqual({ ok: false, reason: "not_found" });
    }
  });

  it("si algo falla a la mitad, no se borra nada (una sola transacción)", async () => {
    // Una fila que apunta a la cadena y que el borrado no conoce hace fallar el último paso.
    await db.execute(sql`create table org_delete_blocker (organization_id uuid references organizations(id))`);
    try {
      await db.execute(sql`insert into org_delete_blocker values (${B.org.id})`);
      const fingerprint = await chainFingerprint(B.org.id);
      await expect(deleteOrganization(B.org.id)).rejects.toThrow();
      expect(await chainFingerprint(B.org.id)).toEqual(fingerprint);
    } finally {
      await db.execute(sql`drop table org_delete_blocker`);
    }
  });
});

describe("org:delete (script)", { timeout: 60_000 }, () => {
  it("muestra los conteos, pide el nombre y solo borra si coincide", async () => {
    const fingerprintA = await chainFingerprint(A.org.id);
    const fingerprintB = await chainFingerprint(B.org.id);

    // Nombre mal escrito, o sin responder: no borra.
    for (const typed of ["cadena b", "Cadena A", "", null]) {
      const r = await runScript(["Cadena B"], typed);
      expect(r.code).toBe(1);
      expect(r.out).toContain("No se borró nada.");
      expect(await chainFingerprint(B.org.id)).toEqual(fingerprintB);
    }

    const ok = await runScript(["Cadena B"], "Cadena B");
    expect(ok.out).toContain('Se va a borrar la cadena "Cadena B"');
    for (const line of [
      "Restaurantes:  2",
      "Usuarios:      2",
      "Encuestas:     3",
      "Tablets:       1",
      "Respuestas:    3",
      "Invitaciones:  1",
    ]) {
      expect(ok.out).toContain(line);
    }
    expect(ok.out).toContain("Escribe el nombre de la cadena para confirmar");
    expect(ok.out).toContain('Cadena "Cadena B" borrada');
    expect(ok.code).toBe(0);
    expect(await db.query.organizations.findFirst({ where: eq(s.organizations.id, B.org.id) })).toBeUndefined();
    expect(await chainFingerprint(A.org.id)).toEqual(fingerprintA);
  });

  it('se niega con "Demo", con nombres duplicados, con uno que no existe y sin argumentos', async () => {
    const demo = await getOrCreateDemoOrg();
    const twin = await createOrg("Cadena B");
    const before = await tableCounts();

    const protectedRun = await runScript(["Demo"], "Demo");
    expect(protectedRun.code).toBe(1);
    expect(protectedRun.out).toContain('La cadena "Demo" no se puede borrar.');
    expect(protectedRun.out).not.toContain("Escribe el nombre");
    expect((await runScript(["--id", demo.id], "Demo")).out).toContain('La cadena "Demo" no se puede borrar.');

    const dup = await runScript(["Cadena B"], "Cadena B");
    expect(dup.code).toBe(1);
    expect(dup.out).toContain("Hay 2 cadenas con ese nombre. No se borró nada. Elige una con --id:");
    expect(dup.out).toContain(B.org.id);
    expect(dup.out).toContain(twin.id);
    expect(dup.out).not.toContain("Escribe el nombre");

    expect((await runScript(["No existe"], "No existe")).out).toContain("No existe una cadena con ese nombre o id.");
    expect((await runScript([], "x")).out).toContain("Uso: npm run org:delete");
    expect((await runScript(["--id", "no-es-uuid"], "x")).out).toContain("Uso: npm run org:delete");

    expect(await tableCounts()).toEqual(before);

    // Con --id sí borra la gemela vacía, y solo esa.
    const byId = await runScript(["--id", twin.id], "Cadena B");
    expect(byId.code).toBe(0);
    expect(await db.query.organizations.findFirst({ where: eq(s.organizations.id, twin.id) })).toBeUndefined();
    expect(await db.query.organizations.findFirst({ where: eq(s.organizations.id, B.org.id) })).toBeDefined();
  });
});
