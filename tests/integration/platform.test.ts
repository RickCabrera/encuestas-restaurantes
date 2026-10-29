import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { deleteOrganization } from "@/lib/orgs";
import { countActivePlatformAdmins, getOrCreateInternalOrg } from "@/lib/platform";
import { getRestaurantBySlug } from "@/lib/queries/public";
import { billingOverview, listClients } from "@/lib/queries/platform";
import { buildSessionUser } from "@/lib/session-user";
import { SubmitError, submitResponse } from "@/lib/submit-response";
import { answersFor, type Chain, createUser, resetDb, seedChain } from "./helpers";

let A: Chain;

beforeEach(async () => {
  await resetDb();
  A = await seedChain("Cadena A", "aaa");
});
afterAll(resetDb);

async function deactivate(orgId: string) {
  await db.update(s.organizations).set({ active: false }).where(eq(s.organizations.id, orgId));
}

describe("cliente desactivado", () => {
  it("su gente pierde la sesión, pero un administrador de la plataforma no", async () => {
    await deactivate(A.org.id);
    const admin = await db.query.users.findFirst({ where: eq(s.users.id, A.admin.id) });
    expect(await buildSessionUser(admin!)).toBeNull();
    await db.update(s.users).set({ platformAdmin: true }).where(eq(s.users.id, A.admin.id));
    const again = await db.query.users.findFirst({ where: eq(s.users.id, A.admin.id) });
    expect((await buildSessionUser(again!))?.platformAdmin).toBe(true);
  });

  it("sus encuestas dejan de recibir respuestas", async () => {
    await deactivate(A.org.id);
    expect((await getRestaurantBySlug("aaa-uno"))?.active).toBe(false);
    await expect(
      submitResponse({ id: randomUUID(), surveyId: A.one.survey.id, answers: answersFor(A.one.byMetric) }, { channel: "QR" }),
    ).rejects.toBeInstanceOf(SubmitError);
  });
});

describe("cadena interna y clientes", () => {
  it("la cadena interna no aparece como cliente ni en pagos", async () => {
    const internal = await getOrCreateInternalOrg();
    expect((await getOrCreateInternalOrg()).id).toBe(internal.id);
    await createUser(internal.id, "equipo@sobremesa.test", "ADMIN");
    const clients = await listClients();
    expect(clients.map((c) => c.name)).toEqual(["Cadena A"]);
    expect(clients[0]).toMatchObject({ restaurants: 2, tablets: 1, users: 2, responses30: 3 });
    const { rows } = await billingOverview();
    expect(rows.map((r) => r.name)).toEqual(["Cadena A"]);
  });

  it("solo cuenta administradores activos de la plataforma", async () => {
    expect(await countActivePlatformAdmins()).toBe(0);
    await db.update(s.users).set({ platformAdmin: true }).where(eq(s.users.id, A.admin.id));
    expect(await countActivePlatformAdmins()).toBe(1);
  });

  it("borrar un cliente borra sus pagos y conserva sus solicitudes sin liga", async () => {
    await db.insert(s.payments).values({
      organizationId: A.org.id,
      period: "2026-10",
      amountCents: 99900,
      method: "CASH",
      paidOn: "2026-10-02",
      recordedByName: "Equipo",
    });
    const [req] = await db
      .insert(s.demoRequests)
      .values({ name: "X", business: "Y", email: "x@y.mx", organizationId: A.org.id })
      .returning();
    await deleteOrganization(A.org.id);
    expect(await db.query.payments.findMany()).toHaveLength(0);
    expect((await db.query.demoRequests.findFirst({ where: eq(s.demoRequests.id, req.id) }))?.organizationId).toBeNull();
  });

  it("los pagos anulados no cuentan", async () => {
    const period = (await billingOverview()).period;
    await db.insert(s.payments).values({
      organizationId: A.org.id,
      period,
      amountCents: 50000,
      method: "TRANSFER",
      paidOn: `${period}-01`,
      recordedByName: "Equipo",
      voidedAt: new Date(),
    });
    const { rows, totals } = await billingOverview(period);
    expect(rows[0].status).not.toBe("PAID");
    expect(totals.collectedCents).toBe(0);
  });
});
