import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/inicio/route";
import { db } from "@/db";
import { signupInvites } from "@/db/schema";
import { findUsableInvite } from "@/lib/invites";
import { createOrg, createUser, resetDb } from "./helpers";

const KEY = "k".repeat(48);

function ask(opts: { key?: string | null; from?: string | null } = {}) {
  const { key = KEY, from = "127.0.0.1" } = opts;
  const url = `http://localhost:3000/inicio${key === null ? "" : `?llave=${key}`}`;
  return GET(new Request(url, { headers: from === null ? {} : { "x-forwarded-for": from } }));
}

const invites = async () => (await db.select().from(signupInvites)).length;

describe("/inicio (acceso directo de la versión instalada en PC)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("APP_MODE", "local");
    vi.stubEnv("LOCAL_TRUSTED_REMOTE", "1");
    vi.stubEnv("LOCAL_SETUP_KEY", KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin usuarios lleva al registro con una invitación de cadena nueva ya puesta", async () => {
    const res = await ask();
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    expect(location).toMatch(/^\/registro\?codigo=[A-Za-z0-9_-]{43}$/);
    const invite = await findUsableInvite(location.split("codigo=")[1]);
    expect(invite?.kind).toBe("NEW_ORG");
  });

  it("acepta las tres formas de loopback", async () => {
    for (const from of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) expect((await ask({ from })).status).toBe(307);
  });

  it("con usuarios lleva al login y no crea invitaciones", async () => {
    await createUser((await createOrg("La Parroquia")).id, "dueno@parroquia.mx", "ADMIN");
    const res = await ask();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/login");
    expect(await invites()).toBe(0);
  });

  it("desde la red responde 404, aunque traiga la llave", async () => {
    for (const from of ["192.168.1.20", "10.0.0.5", "", null]) expect((await ask({ from })).status).toBe(404);
    expect(await invites()).toBe(0);
  });

  it("sin llave o con otra llave responde 404", async () => {
    expect((await ask({ key: null })).status).toBe(404);
    expect((await ask({ key: "x".repeat(48) })).status).toBe(404);
    expect((await ask({ key: KEY.slice(0, 40) })).status).toBe(404);
    expect(await invites()).toBe(0);
  });

  it("sin llave configurada en la PC responde 404", async () => {
    vi.stubEnv("LOCAL_SETUP_KEY", "");
    expect((await ask({ key: "" })).status).toBe(404);
  });

  it("si la app no arrancó con local-server.cjs no se confía en la IP: 404", async () => {
    vi.stubEnv("LOCAL_TRUSTED_REMOTE", "");
    expect((await ask()).status).toBe(404);
  });

  it("en nube no existe", async () => {
    vi.stubEnv("APP_MODE", "");
    expect((await ask()).status).toBe(404);
    expect(await invites()).toBe(0);
  });
});
