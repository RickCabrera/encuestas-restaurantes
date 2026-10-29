import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { verifyLicense } from "@/lib/license-token";
import { activateInstallation, renewInstallation } from "@/lib/licensing-server";
import { type Chain, resetDb, seedChain } from "./helpers";

let A: Chain;
const PASSWORD = "Secreta12345";

beforeEach(async () => {
  await resetDb();
  A = await seedChain("Tacos A", "aaa");
});
afterAll(resetDb);

describe("activar una PC", () => {
  it("con la cuenta del administrador del negocio da una licencia válida para esa cadena", async () => {
    const r = await activateInstallation({ email: A.admin.email, password: PASSWORD, name: "PC-CAJA", version: "1.1.0" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.secret).toBeTruthy();
    const claims = await verifyLicense(r.license);
    expect(claims).toMatchObject({ installationId: r.installationId, organizationId: A.org.id, organizationName: "Tacos A" });
    const row = await db.query.installations.findFirst({ where: eq(s.installations.id, r.installationId) });
    expect(row).toMatchObject({ name: "PC-CAJA", appVersion: "1.1.0", activatedByEmail: A.admin.email });
    expect(row?.secretHash).not.toBe(r.secret);
  });

  it("rechaza contraseña incorrecta, gerentes y clientes desactivados", async () => {
    expect(await activateInstallation({ email: A.admin.email, password: "mala", name: "x" })).toEqual({
      ok: false,
      reason: "credentials",
    });
    expect(await activateInstallation({ email: "nadie@x.mx", password: PASSWORD, name: "x" })).toEqual({
      ok: false,
      reason: "credentials",
    });
    expect(await activateInstallation({ email: A.manager.email, password: PASSWORD, name: "x" })).toEqual({
      ok: false,
      reason: "role",
    });
    await db.update(s.organizations).set({ active: false }).where(eq(s.organizations.id, A.org.id));
    expect(await activateInstallation({ email: A.admin.email, password: PASSWORD, name: "x" })).toEqual({
      ok: false,
      reason: "inactive",
    });
    expect(await db.query.installations.findMany()).toHaveLength(0);
  });
});

describe("renovar", () => {
  it("renueva mientras el cliente siga activo; desactivado o revocado se niega", async () => {
    const a = await activateInstallation({ email: A.admin.email, password: PASSWORD, name: "PC" });
    if (!a.ok) throw new Error("no activó");
    const creds = { installationId: a.installationId, secret: a.secret! };

    const ok = await renewInstallation(creds);
    expect(ok.ok && (await verifyLicense(ok.license))?.organizationId).toBe(A.org.id);

    expect(await renewInstallation({ ...creds, secret: "otro-secreto-que-no-es-el-bueno" })).toEqual({
      ok: false,
      reason: "revoked",
    });

    await db.update(s.organizations).set({ active: false }).where(eq(s.organizations.id, A.org.id));
    expect(await renewInstallation(creds)).toEqual({ ok: false, reason: "inactive" });
    await db.update(s.organizations).set({ active: true }).where(eq(s.organizations.id, A.org.id));
    expect((await renewInstallation(creds)).ok).toBe(true);

    await db.update(s.installations).set({ revokedAt: new Date() }).where(eq(s.installations.id, a.installationId));
    expect(await renewInstallation(creds)).toEqual({ ok: false, reason: "revoked" });
  });
});
