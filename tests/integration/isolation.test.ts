import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { dayInTz } from "@/lib/dates";
import type { SessionUser } from "@/lib/session-user";
import { answersFor, chainFingerprint, type Chain, resetDb, seedChain, sessionFor } from "./helpers";

// ───────── Next.js fuera de una petición real ─────────
// La sesión es la que diga `ctx.user`; redirect/notFound se vuelven errores reconocibles.
const ctx = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(public url: string) {
      super(`redirect:${url}`);
    }
  }
  return {
    user: null as unknown,
    cookies: new Map<string, string>(),
    mails: [] as { to: string[]; subject: string }[],
    Redirect,
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (ctx.cookies.has(k) ? { name: k, value: ctx.cookies.get(k)! } : undefined),
    set: (k: string, v: string) => void ctx.cookies.set(k, v),
    delete: (k: string) => void ctx.cookies.delete(k),
  }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new ctx.Redirect(url);
  },
  notFound: () => {
    throw new Error("notFound");
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof ctx.Redirect) throw e;
  },
}));
vi.mock("@/lib/auth", () => ({
  getSessionUser: async () => ctx.user,
  requireUser: async () => {
    if (!ctx.user) throw new ctx.Redirect("/login");
    return ctx.user;
  },
  requireAdmin: async () => {
    const u = ctx.user as SessionUser | null;
    if (!u) throw new ctx.Redirect("/login");
    if (u.role !== "ADMIN") throw new ctx.Redirect("/admin?error=forbidden");
    return u;
  },
  createSession: async () => {},
  destroySession: async () => {},
}));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: async (mail: { to: string[]; subject: string }) => void ctx.mails.push(mail),
}));

const { changePasswordAction } = await import("@/app/actions/auth");
const devicesActions = await import("@/app/actions/devices");
const { cancelInviteAction, createInviteAction } = await import("@/app/actions/invites");
const { setRestaurantFilterAction } = await import("@/app/actions/preferences");
const restaurantActions = await import("@/app/actions/restaurants");
const surveyActions = await import("@/app/actions/surveys");
const userActions = await import("@/app/actions/users");
const exportRoute = await import("@/app/api/export/route");
const kioskConfigRoute = await import("@/app/api/kiosk/config/route");
const kioskPairRoute = await import("@/app/api/kiosk/pair/route");
const logoRoute = await import("@/app/api/logo/[id]/route");
const qrRoute = await import("@/app/api/qr/[id]/route");
const responsesRoute = await import("@/app/api/responses/route");
const { canAccessRestaurant } = await import("@/lib/authz");
const filtersLib = await import("@/lib/filters");
const { getAccessibleRestaurant, listAccessibleRestaurants } = await import("@/lib/queries/restaurants");
const results = await import("@/lib/queries/results");
const { getAccessibleSurvey } = await import("@/lib/queries/surveys");
const { submitResponse } = await import("@/lib/submit-response");
type Filters = import("@/lib/filters").Filters;

let A: Chain;
let B: Chain;
let adminA: SessionUser;
let adminB: SessionUser;
let managerA: SessionUser;
let fingerprintB: Record<string, string>;

const as = (u: SessionUser | null) => {
  ctx.user = u;
};

beforeAll(async () => {
  await resetDb();
  A = await seedChain("Cadena A", "aaa");
  B = await seedChain("Cadena B", "bbb");
});
beforeEach(async () => {
  adminA = await sessionFor(A.admin.id);
  adminB = await sessionFor(B.admin.id);
  managerA = await sessionFor(A.manager.id);
  as(adminA);
  ctx.cookies.clear();
  ctx.mails.length = 0;
  fingerprintB = await chainFingerprint(B.org.id);
});
afterAll(resetDb);

/** Ninguna fila de la cadena B cambió, apareció ni desapareció desde el inicio de la prueba. */
async function expectBUntouched() {
  expect(await chainFingerprint(B.org.id)).toEqual(fingerprintB);
}

const today = dayInTz(new Date());
const filters = (over: Partial<Filters> = {}): Filters => ({
  restaurantId: null,
  from: "2020-01-01",
  to: today,
  channel: null,
  surveyId: null,
  table: null,
  lowOnly: false,
  q: null,
  page: 1,
  ...over,
});
const form = (data: Record<string, string | string[] | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (path: string) => new Request(`http://localhost:3000${path}`);
const validSurveyInput = {
  title: "Hackeada",
  welcomeText: "x",
  closingText: "y",
  questions: [{ type: "RATING_5" as const, text: "¿Pregunta cambiada?", required: true, metric: "NONE" as const }],
};
const restaurantForm = (over: Record<string, string | File> = {}) =>
  form({ name: "Nombre cambiado", slug: "", primaryColor: "#112233", kioskResetSeconds: "8", kioskIdleSeconds: "60", ...over });

describe("alcance de la sesión", () => {
  it("el admin ve todos los restaurantes de SU cadena y ninguno de la otra", () => {
    expect([...adminA.restaurantIds].sort()).toEqual([A.one.restaurant.id, A.two.restaurant.id].sort());
    expect(adminA).toMatchObject({ organizationId: A.org.id, organizationName: "Cadena A", role: "ADMIN" });
    for (const r of [B.one, B.two]) expect(canAccessRestaurant(adminA, r.restaurant.id)).toBe(false);
    expect([...adminB.restaurantIds].sort()).toEqual([B.one.restaurant.id, B.two.restaurant.id].sort());
  });

  it("el gerente ve solo sus restaurantes asignados, y una asignación a otra cadena no cuenta", async () => {
    expect(managerA.restaurantIds).toEqual([A.one.restaurant.id]);
    // Aunque la fila existiera (por un error o manipulación), el alcance se cruza con la cadena.
    await db.insert(s.userRestaurants).values({ userId: A.manager.id, restaurantId: B.one.restaurant.id });
    try {
      const again = await sessionFor(A.manager.id);
      expect(again.restaurantIds).toEqual([A.one.restaurant.id]);
      expect((await results.getSummary(filters(), again)).responses).toBe(2);
    } finally {
      await db
        .delete(s.userRestaurants)
        .where(and(eq(s.userRestaurants.userId, A.manager.id), eq(s.userRestaurants.restaurantId, B.one.restaurant.id)));
    }
  });
});

describe("lectura: el admin de A no ve nada de B", () => {
  it("selector de restaurante y ficha de restaurante", async () => {
    const list = await listAccessibleRestaurants(adminA, { includeInactive: true });
    expect(list.map((r) => r.name).sort()).toEqual(A.restaurantNames);
    expect(await getAccessibleRestaurant(adminA, B.one.restaurant.id)).toBeUndefined();
    expect((await getAccessibleRestaurant(adminA, A.one.restaurant.id))?.id).toBe(A.one.restaurant.id);

    // Elegir en el selector un restaurante ajeno no lo guarda; uno propio sí.
    await setRestaurantFilterAction(B.one.restaurant.id);
    expect(ctx.cookies.has(filtersLib.RESTAURANT_COOKIE)).toBe(false);
    await setRestaurantFilterAction(A.one.restaurant.id);
    expect(ctx.cookies.get(filtersLib.RESTAURANT_COOKIE)).toBe(A.one.restaurant.id);

    // Un id ajeno en la URL (o en una cookie vieja) se ignora.
    ctx.cookies.set(filtersLib.RESTAURANT_COOKIE, B.one.restaurant.id);
    expect((await filtersLib.parseFilters({}, adminA)).restaurantId).toBeNull();
    expect((await filtersLib.parseFilters({ restaurant: B.two.restaurant.id }, adminA)).restaurantId).toBeNull();
  });

  it("resumen, tendencia, comparativo, respuestas y comentarios", async () => {
    expect((await results.getSummary(filters(), adminA)).responses).toBe(3);
    expect((await results.getPreviousSummary(filters(), adminA)).responses).toBe(0);
    expect((await results.getTrend(filters({ from: today }), adminA)).points.reduce((n, p) => n + p.responses, 0)).toBe(3);
    expect((await results.getRanking(filters(), adminA)).map((r) => r.name).sort()).toEqual(A.restaurantNames);

    const list = await results.listResponses(filters(), adminA);
    expect(list.total).toBe(3);
    expect(list.rows.map((r) => r.id).sort()).toEqual([...A.responseIds].sort());

    const comments = await results.listComments(filters(), adminA);
    expect(comments.total).toBe(3);
    expect(new Set(comments.rows.map((c) => c.text))).toEqual(new Set(["Comentario aaa"]));
    expect((await results.listComments(filters({ q: "bbb" }), adminA)).total).toBe(0);

    // Pedir explícitamente un restaurante o una encuesta de B no devuelve nada.
    for (const over of [{ restaurantId: B.one.restaurant.id }, { surveyId: B.one.survey.id }]) {
      expect((await results.getSummary(filters(over), adminA)).responses).toBe(0);
      expect((await results.listResponses(filters(over), adminA)).total).toBe(0);
      expect((await results.listComments(filters(over), adminA)).total).toBe(0);
      expect(
        await results.getRanking(filters(over), adminA).then((r) => r.filter((x) => !A.restaurantNames.includes(x.name))),
      ).toEqual([]);
    }
  });

  it("detalle de una respuesta y resultados por pregunta de una encuesta", async () => {
    expect(await results.getResponseDetail(B.responseIds[0], adminA)).toBeNull();
    expect((await results.getResponseDetail(A.responseIds[0], adminA))?.restaurant.name).toBe("Restaurante aaa uno");

    expect(await getAccessibleSurvey(adminA, B.one.survey.id)).toBeUndefined();
    expect(await getAccessibleSurvey(adminA, B.draft.id)).toBeUndefined();
    expect((await getAccessibleSurvey(adminA, A.one.survey.id))?.questions).toHaveLength(6);

    const res = await results.getSurveyQuestionResults(B.one.survey.id, filters({ surveyId: B.one.survey.id }), adminA);
    expect(res).toEqual({ total: 0, grouped: [], textCounts: [], recentText: [] });
    expect(await results.getFirstResponseAt(B.one.survey.id, adminA)).toBeNull();
    expect((await results.getSurveyQuestionResults(A.one.survey.id, filters(), adminA)).total).toBe(2);
  });

  it("export CSV", async () => {
    for (const qs of ["", `?restaurant=${B.one.restaurant.id}`, `?survey=${B.one.survey.id}`, "?from=2020-01-01"]) {
      const res = await exportRoute.GET(get(`/api/export${qs}`));
      expect(res.status).toBe(200);
      const csv = await res.text();
      expect(csv).not.toContain("bbb");
      expect(csv).not.toContain("Restaurante bbb");
      // Encabezado + las filas de A (ninguna si el filtro apunta a una encuesta de B).
      expect(csv.trim().split("\r\n")).toHaveLength(qs.startsWith("?survey") ? 1 : 4);
    }
    as(null);
    expect((await exportRoute.GET(get("/api/export"))).status).toBe(401);
  });

  it("QR: 404 para un restaurante de otra cadena, en todos sus formatos", async () => {
    for (const qs of ["?format=png", "?format=pdf", "?format=pdf&tables=1-6"]) {
      const res = await qrRoute.GET(get(`/api/qr/${B.one.restaurant.id}${qs}`), idParams(B.one.restaurant.id));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "No encontrado" });
    }
    const own = await qrRoute.GET(get(`/api/qr/${A.one.restaurant.id}?format=png`), idParams(A.one.restaurant.id));
    expect(own.status).toBe(200);
    expect(own.headers.get("content-type")).toBe("image/png");
    as(null);
    expect((await qrRoute.GET(get(`/api/qr/${A.one.restaurant.id}`), idParams(A.one.restaurant.id))).status).toBe(401);
  });

  it("gerente de A: tampoco ve el otro restaurante de su propia cadena", async () => {
    expect((await results.getSummary(filters(), managerA)).responses).toBe(2);
    expect(await getAccessibleRestaurant(managerA, A.two.restaurant.id)).toBeUndefined();
    expect(await getAccessibleSurvey(managerA, A.two.survey.id)).toBeUndefined();
    expect(await results.getResponseDetail(A.responseIds[2], managerA)).toBeNull();
    as(managerA);
    expect((await qrRoute.GET(get(`/api/qr/${A.two.restaurant.id}`), idParams(A.two.restaurant.id))).status).toBe(404);
    expect((await qrRoute.GET(get(`/api/qr/${B.one.restaurant.id}`), idParams(B.one.restaurant.id))).status).toBe(404);
    const csv = await (await exportRoute.GET(get("/api/export"))).text();
    expect(csv).toContain("Restaurante aaa uno");
    expect(csv).not.toContain("Restaurante aaa dos");
    expect(csv).not.toContain("bbb");
  });
});

describe("escritura: el admin de A no modifica nada de B", () => {
  it("encuestas: crear, editar, publicar, archivar, duplicar y eliminar", async () => {
    const before = await db.select({ n: count() }).from(s.surveys);

    expect(
      await surveyActions.createSurveyAction({}, form({ restaurantId: B.one.restaurant.id, title: "Intrusa", template: "base" })),
    ).toEqual({
      fieldErrors: { restaurantId: ["Restaurante no encontrado"] },
    });
    const notFound = { error: "Encuesta no encontrada" };
    expect(await surveyActions.saveSurveyAction(B.draft.id, validSurveyInput)).toEqual(notFound);
    expect(await surveyActions.publishSurveyAction(B.draft.id)).toEqual(notFound);
    expect(await surveyActions.archiveSurveyAction(B.one.survey.id)).toEqual(notFound);
    expect(await surveyActions.deleteSurveyAction(B.draft.id)).toEqual(notFound);
    // Ni copiar una encuesta de B hacia A, ni una de A hacia un restaurante de B.
    expect(await surveyActions.duplicateSurveyAction(B.one.survey.id, [A.one.restaurant.id])).toEqual(notFound);
    expect(await surveyActions.duplicateSurveyAction(A.one.survey.id, [B.one.restaurant.id])).toEqual({
      error: "Algún restaurante no existe.",
    });
    expect(await surveyActions.duplicateSurveyAction(A.one.survey.id, [A.two.restaurant.id, B.two.restaurant.id])).toEqual({
      error: "Algún restaurante no existe.",
    });

    expect(await db.select({ n: count() }).from(s.surveys)).toEqual(before);
    await expectBUntouched();

    // Lo mismo, dentro de su cadena, sí funciona.
    const ok = await surveyActions.duplicateSurveyAction(A.one.survey.id, [A.two.restaurant.id]);
    expect(ok.ok).toBe(true);
    const copy = await db.query.surveys.findFirst({ where: eq(s.surveys.id, ok.newId!) });
    expect(copy).toMatchObject({ restaurantId: A.two.restaurant.id, status: "DRAFT" });
    expect((await surveyActions.deleteSurveyAction(ok.newId!).catch((e) => e)) instanceof ctx.Redirect).toBe(true);
    await expectBUntouched();
  });

  it("restaurantes: editar, logo, activar/desactivar; y el que crea queda en su cadena", async () => {
    const notFound = { error: "Restaurante no encontrado." };
    const png = new File([Buffer.from("otro-logo")], "logo.png", { type: "image/png" });
    expect(await restaurantActions.updateRestaurantAction(B.one.restaurant.id, {}, restaurantForm())).toEqual(notFound);
    expect(await restaurantActions.updateRestaurantAction(B.one.restaurant.id, {}, restaurantForm({ logo: png }))).toEqual(
      notFound,
    );
    expect(await restaurantActions.updateRestaurantAction(B.one.restaurant.id, {}, restaurantForm({ removeLogo: "on" }))).toEqual(
      notFound,
    );
    expect(await restaurantActions.updateRestaurantAction(B.one.restaurant.id, {}, restaurantForm({ kioskPin: "9999" }))).toEqual(
      notFound,
    );
    await restaurantActions.setRestaurantActiveAction(B.one.restaurant.id, false);
    await expectBUntouched();

    const created = await restaurantActions
      .createRestaurantAction({}, restaurantForm({ name: "Nuevo de A", slug: "nuevo-de-a", kioskPin: "1234" }))
      .catch((e) => e);
    expect(created).toBeInstanceOf(ctx.Redirect);
    const row = await db.query.restaurants.findFirst({ where: eq(s.restaurants.slug, "nuevo-de-a") });
    expect(row?.organizationId).toBe(A.org.id);
    // El slug sigue siendo único entre todas las cadenas.
    as(adminB);
    expect(
      await restaurantActions.createRestaurantAction({}, restaurantForm({ name: "Copia", slug: "nuevo-de-a", kioskPin: "1234" })),
    ).toEqual({ fieldErrors: { slug: ["Ya existe un restaurante con esa dirección"] } });
    expect(await getAccessibleRestaurant(adminB, row!.id)).toBeUndefined();
    await db.delete(s.restaurants).where(eq(s.restaurants.id, row!.id));
    await expectBUntouched();
  });

  it("logo: es público (lo ve el comensal), pero solo su cadena puede cambiarlo", async () => {
    // /api/logo/[id] no lleva sesión a propósito: es la misma imagen de /r/[slug]. No expone nada más.
    as(null);
    const res = await logoRoute.GET(get(`/api/logo/${B.one.restaurant.id}`), idParams(B.one.restaurant.id));
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(B.logo);
    expect((await logoRoute.GET(get(`/api/logo/${randomUUID()}`), idParams(randomUUID()))).status).toBe(404);

    as(adminA);
    const png = new File([Buffer.from("logo-intruso")], "logo.png", { type: "image/png" });
    await restaurantActions.updateRestaurantAction(B.one.restaurant.id, {}, restaurantForm({ logo: png }));
    const after = await logoRoute.GET(get(`/api/logo/${B.one.restaurant.id}`), idParams(B.one.restaurant.id));
    expect(Buffer.from(await after.arrayBuffer())).toEqual(B.logo);
    await expectBUntouched();
  });

  it("tablets: crear, código de vinculación, desvincular, eliminar y renombrar", async () => {
    expect(await devicesActions.createDeviceAction({}, form({ name: "Intrusa", restaurantId: B.one.restaurant.id }))).toEqual({
      fieldErrors: { restaurantId: ["Restaurante no encontrado"] },
    });
    expect(await devicesActions.generatePairingCodeAction(B.device.id)).toEqual({ error: "Tablet no encontrada" });
    await devicesActions.revokeDeviceAction(B.device.id);
    await devicesActions.deleteDeviceAction(B.device.id);
    await devicesActions.renameDeviceAction(B.device.id, "Renombrada");
    await expectBUntouched();

    // La tablet de B sigue vinculada y solo recibe la configuración de B.
    const cfg = await kioskConfigRoute.GET(
      new Request("http://localhost/api/kiosk/config", { headers: { authorization: `Bearer ${B.deviceToken}` } }),
    );
    expect(cfg.status).toBe(200);
    expect((await cfg.json()).restaurant.id).toBe(B.one.restaurant.id);
  });

  it("vinculación: un código de A vincula una tablet de A, que no puede responder encuestas de B", async () => {
    const state = await devicesActions.createDeviceAction(
      {},
      form({ name: "Tablet nueva A", restaurantId: A.one.restaurant.id }),
    );
    expect(state.code).toMatch(/^\d{6}$/);
    const pair = await kioskPairRoute.POST(
      new Request("http://localhost/api/kiosk/pair", {
        method: "POST",
        body: JSON.stringify({ code: state.code }),
        headers: { "x-forwarded-for": randomUUID() },
      }),
    );
    expect(pair.status).toBe(200);
    const { token, deviceId } = await pair.json();
    const device = await db.query.devices.findFirst({ where: eq(s.devices.id, deviceId) });
    expect(device).toMatchObject({ restaurantId: A.one.restaurant.id, tokenHash: sha256(token) });

    const cfg = await (
      await kioskConfigRoute.GET(
        new Request("http://localhost/api/kiosk/config", { headers: { authorization: `Bearer ${token}` } }),
      )
    ).json();
    expect(cfg.restaurant.id).toBe(A.one.restaurant.id);
    expect(cfg.survey.id).toBe(A.one.survey.id);

    const post = (surveyId: string, byMetric: Record<string, string>) =>
      responsesRoute.POST(
        new Request("http://localhost/api/responses", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: randomUUID(), surveyId, answers: answersFor(byMetric) }),
        }),
      );
    expect((await post(B.one.survey.id, B.one.byMetric)).status).toBe(403);
    await expectBUntouched();
    // Y un admin de B no puede tocar esa tablet de A.
    as(adminB);
    expect(await devicesActions.generatePairingCodeAction(deviceId)).toEqual({ error: "Tablet no encontrada" });
    await devicesActions.deleteDeviceAction(deviceId);
    expect((await db.query.devices.findFirst({ where: eq(s.devices.id, deviceId) }))?.active).toBe(true);
    await db.delete(s.devices).where(eq(s.devices.id, deviceId));
  });

  it("usuarios: crear, editar y desactivar", async () => {
    const userForm = (over: Record<string, string | string[]> = {}) =>
      form({
        name: "Persona",
        email: "persona@aaa.test",
        role: "MANAGER",
        restaurantIds: [A.one.restaurant.id],
        password: "Secreta12345",
        ...over,
      });
    const badRestaurants = { fieldErrors: { restaurantIds: ["Elige restaurantes de la lista"] } };

    // No se puede asignar a un gerente un restaurante de otra cadena (ni mezclado con uno propio).
    expect(await userActions.createUserAction({}, userForm({ restaurantIds: [B.one.restaurant.id] }))).toEqual(badRestaurants);
    expect(
      await userActions.createUserAction({}, userForm({ restaurantIds: [A.one.restaurant.id, B.one.restaurant.id] })),
    ).toEqual(badRestaurants);
    expect(
      await userActions.updateUserAction(
        A.manager.id,
        {},
        userForm({ email: A.manager.email, restaurantIds: [B.two.restaurant.id] }),
      ),
    ).toEqual(badRestaurants);
    // Ni editar o desactivar a un usuario de B (ni siquiera cambiarle la contraseña).
    for (const target of [B.admin, B.manager]) {
      expect(
        await userActions.updateUserAction(
          target.id,
          {},
          userForm({ email: target.email, role: "ADMIN", password: "NuevaClave123" }),
        ),
      ).toEqual({
        error: "Usuario no encontrado.",
      });
      await userActions.setUserActiveAction(target.id, false);
    }
    // El correo es único entre cadenas.
    expect(await userActions.createUserAction({}, userForm({ email: B.manager.email }))).toEqual({
      fieldErrors: { email: ["Ya existe un usuario con ese correo"] },
    });
    await expectBUntouched();

    expect(await userActions.createUserAction({}, userForm()).catch((e) => e)).toBeInstanceOf(ctx.Redirect);
    const created = await db.query.users.findFirst({ where: eq(s.users.email, "persona@aaa.test") });
    expect(created?.organizationId).toBe(A.org.id);
    await db.delete(s.users).where(eq(s.users.id, created!.id));
    await expectBUntouched();
  });

  it("invitaciones: se crean en la cadena de quien invita y no se cancelan las de otra", async () => {
    const bad = { fieldErrors: { restaurantIds: ["Elige restaurantes de la lista"] } };
    expect(await createInviteAction({}, form({ role: "MANAGER", restaurantIds: [B.one.restaurant.id] }))).toEqual(bad);
    expect(
      await createInviteAction({}, form({ role: "MANAGER", restaurantIds: [A.one.restaurant.id, B.one.restaurant.id] })),
    ).toEqual(bad);
    await cancelInviteAction(B.invite.id);
    await expectBUntouched();

    const state = await createInviteAction({}, form({ role: "MANAGER", restaurantIds: [A.two.restaurant.id] }));
    const token = new URL(state.link!).searchParams.get("codigo")!;
    const invite = await db.query.signupInvites.findFirst({ where: eq(s.signupInvites.tokenHash, sha256(token)) });
    expect(invite).toMatchObject({
      kind: "USER",
      organizationId: A.org.id,
      role: "MANAGER",
      restaurantIds: [A.two.restaurant.id],
    });

    // B tampoco puede cancelar la de A; A sí.
    as(adminB);
    await cancelInviteAction(invite!.id);
    expect(await db.query.signupInvites.findFirst({ where: eq(s.signupInvites.id, invite!.id) })).toBeDefined();
    as(adminA);
    await cancelInviteAction(invite!.id);
    expect(await db.query.signupInvites.findFirst({ where: eq(s.signupInvites.id, invite!.id) })).toBeUndefined();
  });

  it("Mi cuenta: las preferencias y la contraseña cambian solo las de uno mismo", async () => {
    await userActions.updateNotificationsAction({}, form({}));
    expect((await db.query.users.findFirst({ where: eq(s.users.id, A.admin.id) }))?.notifyLowScores).toBe(false);
    await userActions.updateNotificationsAction({}, form({ notifyLowScores: "on" }));
    expect(
      await changePasswordAction({}, form({ current: "Secreta12345", password: "OtraSecreta123", confirm: "OtraSecreta123" })),
    ).toMatchObject({ ok: true });
    await db.update(s.users).set({ passwordHash: B.admin.passwordHash, sessionVersion: 1 }).where(eq(s.users.id, A.admin.id));
    await expectBUntouched();
  });

  it("un gerente no puede usar ninguna acción de administrador, ni en su cadena", async () => {
    as(managerA);
    const forbidden = async (p: Promise<unknown>) =>
      expect(await p.catch((e) => e)).toMatchObject({ url: "/admin?error=forbidden" });
    await forbidden(surveyActions.publishSurveyAction(A.draft.id));
    await forbidden(restaurantActions.setRestaurantActiveAction(A.one.restaurant.id, false));
    await forbidden(devicesActions.generatePairingCodeAction(A.device.id));
    await forbidden(userActions.setUserActiveAction(A.admin.id, false));
    await forbidden(createInviteAction({}, form({ role: "ADMIN" })));
    await forbidden(cancelInviteAction(A.invite.id));
  });
});

describe("alertas por correo de calificación baja", () => {
  it("solo llegan a usuarios de la cadena del restaurante", async () => {
    const low = (r: Chain["one"]) =>
      submitResponse(
        { id: randomUUID(), surveyId: r.survey.id, answers: answersFor(r.byMetric, { [r.byMetric.FOOD]: 1 }) },
        { channel: "QR" },
      );
    const sent = async (r: Chain["one"]) => {
      ctx.mails.length = 0;
      const res = await low(r);
      expect(res.lowScore).toBe(true);
      await res.alert!();
      expect(ctx.mails).toHaveLength(1);
      return [...ctx.mails[0].to].sort();
    };

    try {
      // Restaurante uno: su admin y su gerente asignado. Restaurante dos: solo el admin.
      expect(await sent(A.one)).toEqual([A.admin.email, A.manager.email].sort());
      expect(await sent(A.two)).toEqual([A.admin.email]);
      expect(await sent(B.one)).toEqual([B.admin.email, B.manager.email].sort());

      // Ni con una asignación cruzada indebida le llega a un gerente de otra cadena.
      await db.insert(s.userRestaurants).values({ userId: B.manager.id, restaurantId: A.two.restaurant.id });
      expect(await sent(A.two)).toEqual([A.admin.email]);

      // Un admin desactivado o que apagó sus alertas no recibe nada.
      await db.update(s.users).set({ notifyLowScores: false }).where(eq(s.users.id, A.admin.id));
      ctx.mails.length = 0;
      await (
        await low(A.two)
      ).alert!();
      expect(ctx.mails).toEqual([]);
    } finally {
      await db.update(s.users).set({ notifyLowScores: true }).where(eq(s.users.id, A.admin.id));
      await db
        .delete(s.userRestaurants)
        .where(and(eq(s.userRestaurants.userId, B.manager.id), eq(s.userRestaurants.restaurantId, A.two.restaurant.id)));
      await db.delete(s.responses).where(eq(s.responses.lowScore, true));
    }
  });
});

describe("y al revés", () => {
  it("el admin de B tampoco ve ni toca nada de A", async () => {
    const fingerprintA = await chainFingerprint(A.org.id);
    as(adminB);
    expect((await results.getSummary(filters(), adminB)).responses).toBe(3);
    expect((await listAccessibleRestaurants(adminB)).map((r) => r.name).sort()).toEqual(B.restaurantNames);
    expect(await results.getResponseDetail(A.responseIds[0], adminB)).toBeNull();
    expect(await getAccessibleSurvey(adminB, A.one.survey.id)).toBeUndefined();
    expect((await (await exportRoute.GET(get("/api/export"))).text()).includes("aaa")).toBe(false);
    expect((await qrRoute.GET(get(`/api/qr/${A.one.restaurant.id}`), idParams(A.one.restaurant.id))).status).toBe(404);
    expect(await surveyActions.publishSurveyAction(A.draft.id)).toEqual({ error: "Encuesta no encontrada" });
    expect(await restaurantActions.updateRestaurantAction(A.one.restaurant.id, {}, restaurantForm())).toEqual({
      error: "Restaurante no encontrado.",
    });
    expect(await devicesActions.generatePairingCodeAction(A.device.id)).toEqual({ error: "Tablet no encontrada" });
    await userActions.setUserActiveAction(A.admin.id, false);
    await cancelInviteAction(A.invite.id);
    expect(await chainFingerprint(A.org.id)).toEqual(fingerprintA);
  });
});
