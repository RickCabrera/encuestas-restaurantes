import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getConfig } from "@/app/api/kiosk/config/route";
import { POST as unpair } from "@/app/api/kiosk/unpair/route";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { chainFingerprint, resetDb, seedChain } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
});

const request = (token?: string, body?: unknown) =>
  new Request("http://localhost/api/kiosk/unpair", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const configRequest = (token: string) =>
  new Request("http://localhost/api/kiosk/config", { headers: { Authorization: `Bearer ${token}` } });

const deviceRow = async (id: string) => (await db.query.devices.findFirst({ where: eq(devices.id, id) }))!;

/** Otra tablet vinculada en el mismo restaurante. */
async function secondDevice(restaurantId: string) {
  const token = randomToken();
  const [device] = await db
    .insert(devices)
    .values({ restaurantId, name: "Tablet vecina", tokenHash: sha256(token), pairedAt: new Date() })
    .returning();
  return { device, token };
}

describe("POST /api/kiosk/unpair", () => {
  it("exige el token de la tablet", async () => {
    const a = await seedChain("Cadena A", "a");
    const before = await chainFingerprint(a.org.id);

    expect((await unpair(request())).status).toBe(401);
    expect((await unpair(request("corto"))).status).toBe(401);
    expect((await unpair(request(randomToken()))).status).toBe(401);
    // Ni el id ni el nombre de una tablet sirven como credencial.
    expect((await unpair(request(a.device.id))).status).toBe(401);

    expect(await chainFingerprint(a.org.id)).toEqual(before);
  });

  it("desvincula solo a la tablet dueña del token y la deja lista para un código nuevo", async () => {
    const a = await seedChain("Cadena A", "a");

    const res = await unpair(request(a.deviceToken));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = await deviceRow(a.device.id);
    expect(row).toMatchObject({ tokenHash: null, pairedAt: null, pairingCode: null, active: true });
    // El token ya no sirve: la tablet vuelve a la pantalla de vinculación.
    expect((await getConfig(configRequest(a.deviceToken))).status).toBe(401);
    expect((await unpair(request(a.deviceToken))).status).toBe(401);
  });

  it("una tablet no puede desvincular a otra de su mismo restaurante", async () => {
    const a = await seedChain("Cadena A", "a");
    const other = await secondDevice(a.one.restaurant.id);

    // Aunque mande el id de la otra en el cuerpo, la que se libera es la del token.
    const res = await unpair(request(a.deviceToken, { deviceId: other.device.id, id: other.device.id }));
    expect(res.status).toBe(200);

    expect((await deviceRow(a.device.id)).tokenHash).toBeNull();
    expect(await deviceRow(other.device.id)).toMatchObject({ tokenHash: sha256(other.token), active: true });
    expect((await getConfig(configRequest(other.token))).status).toBe(200);
  });

  it("una tablet no puede desvincular a la de otra cadena", async () => {
    const a = await seedChain("Cadena A", "a");
    const b = await seedChain("Cadena B", "b");
    const before = await chainFingerprint(b.org.id);

    const res = await unpair(request(a.deviceToken, { deviceId: b.device.id }));
    expect(res.status).toBe(200);

    expect((await deviceRow(a.device.id)).tokenHash).toBeNull();
    expect(await chainFingerprint(b.org.id)).toEqual(before);
    expect((await getConfig(configRequest(b.deviceToken))).status).toBe(200);
  });

  it("una tablet eliminada desde el panel no puede usar la ruta", async () => {
    const a = await seedChain("Cadena A", "a");
    await db.update(devices).set({ active: false }).where(eq(devices.id, a.device.id));
    expect((await unpair(request(a.deviceToken))).status).toBe(401);
    expect((await deviceRow(a.device.id)).tokenHash).toBe(sha256(a.deviceToken));
  });
});
