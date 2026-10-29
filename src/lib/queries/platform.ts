import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { demoRequests, installations, organizations, payments, users, type DemoRequestStatus } from "@/db/schema";
import { billingStatus, periodOf, type BillingStatus } from "@/lib/billing";
import { APP_TIMEZONE, dayInTz } from "@/lib/dates";

export type ClientRow = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  billingDay: number;
  contactName: string | null;
  contactEmail: string | null;
  restaurants: number;
  tablets: number;
  users: number;
  responses30: number;
  lastResponseAt: Date | null;
  /** PCs activas (el .exe) y lo que reportan: sus datos viven en cada PC, no en la nube. */
  pcs: number;
  pcRestaurants: number;
  pcResponses30: number;
};

/** Clientes (todas las cadenas menos la interna del equipo) con sus números principales. */
export async function listClients(opts: { id?: string } = {}): Promise<ClientRow[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    active: boolean;
    created_at: Date;
    billing_day: number;
    contact_name: string | null;
    contact_email: string | null;
    restaurants: number;
    tablets: number;
    users: number;
    responses30: number;
    last_response_at: Date | null;
    pcs: number;
    pc_restaurants: number;
    pc_responses30: number;
  }>(sql`
    select o.id, o.name, o.active, o.created_at, o.billing_day, o.contact_name, o.contact_email,
      (select count(*)::int from restaurants r where r.organization_id = o.id) as restaurants,
      (select count(*)::int from devices d join restaurants r on r.id = d.restaurant_id
         where r.organization_id = o.id and d.active and d.token_hash is not null) as tablets,
      (select count(*)::int from users u where u.organization_id = o.id and u.active) as users,
      (select count(*)::int from responses x join restaurants r on r.id = x.restaurant_id
         where r.organization_id = o.id and x.submitted_at > now() - interval '30 days') as responses30,
      (select max(x.submitted_at) from responses x join restaurants r on r.id = x.restaurant_id
         where r.organization_id = o.id) as last_response_at,
      (select count(*)::int from installations i where i.organization_id = o.id and i.revoked_at is null) as pcs,
      (select coalesce(sum((i.stats->>'restaurants')::int), 0)::int from installations i
         where i.organization_id = o.id and i.revoked_at is null) as pc_restaurants,
      (select coalesce(sum((i.stats->>'responses30')::int), 0)::int from installations i
         where i.organization_id = o.id and i.revoked_at is null) as pc_responses30
    from organizations o
    where o.internal = false ${opts.id ? sql`and o.id = ${opts.id}` : sql``}
    order by o.active desc, o.created_at desc
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    active: r.active,
    createdAt: new Date(r.created_at),
    billingDay: r.billing_day,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    restaurants: Number(r.restaurants),
    tablets: Number(r.tablets),
    users: Number(r.users),
    responses30: Number(r.responses30),
    lastResponseAt: r.last_response_at ? new Date(r.last_response_at) : null,
    pcs: Number(r.pcs),
    pcRestaurants: Number(r.pc_restaurants),
    pcResponses30: Number(r.pc_responses30),
  }));
}

export async function getClientOrg(id: string) {
  return db.query.organizations.findFirst({ where: and(eq(organizations.id, id), eq(organizations.internal, false)) });
}

/** Restaurantes de un cliente con sus tablets, encuesta activa y respuestas recientes. */
export async function listClientRestaurants(orgId: string) {
  const rows = await db.execute<{
    id: string;
    name: string;
    slug: string;
    address: string | null;
    active: boolean;
    tablets: number;
    active_survey: string | null;
    responses30: number;
  }>(sql`
    select r.id, r.name, r.slug, r.address, r.active,
      (select count(*)::int from devices d where d.restaurant_id = r.id and d.active and d.token_hash is not null) as tablets,
      (select s.title from surveys s where s.restaurant_id = r.id and s.status = 'ACTIVE' limit 1) as active_survey,
      (select count(*)::int from responses x where x.restaurant_id = r.id and x.submitted_at > now() - interval '30 days') as responses30
    from restaurants r
    where r.organization_id = ${orgId}
    order by r.name
  `);
  return rows.map((r) => ({ ...r, tablets: Number(r.tablets), responses30: Number(r.responses30) }));
}

export async function listClientUsers(orgId: string) {
  return db.query.users.findMany({
    where: eq(users.organizationId, orgId),
    orderBy: [desc(users.role), asc(users.name)],
    columns: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, platformAdmin: true },
  });
}

export type BillingRow = {
  id: string;
  name: string;
  billingDay: number;
  status: BillingStatus;
  paidCents: number;
  lastPayment: { paidOn: string; amountCents: number } | null;
};

/** Estado de la mensualidad de `period` de cada cliente activo. */
export async function billingOverview(period = periodOf(new Date())) {
  const today = dayInTz(new Date(), APP_TIMEZONE);
  const orgs = await db.query.organizations.findMany({
    where: and(eq(organizations.internal, false), eq(organizations.active, true)),
    orderBy: asc(organizations.name),
  });
  const ids = orgs.map((o) => o.id);
  const pays = ids.length
    ? await db.query.payments.findMany({
        where: and(inArray(payments.organizationId, ids), isNull(payments.voidedAt)),
        orderBy: desc(payments.paidOn),
      })
    : [];
  const rows: BillingRow[] = orgs.map((o) => {
    const mine = pays.filter((p) => p.organizationId === o.id);
    const paidPeriods = new Set(mine.map((p) => p.period));
    const last = mine[0];
    return {
      id: o.id,
      name: o.name,
      billingDay: o.billingDay,
      status: billingStatus({ period, today, billingDay: o.billingDay, createdDay: dayInTz(o.createdAt), paidPeriods }),
      paidCents: mine.filter((p) => p.period === period).reduce((a, p) => a + p.amountCents, 0),
      lastPayment: last ? { paidOn: last.paidOn, amountCents: last.amountCents } : null,
    };
  });
  return {
    period,
    rows,
    totals: {
      paid: rows.filter((r) => r.status === "PAID").length,
      pending: rows.filter((r) => r.status === "PENDING").length,
      overdue: rows.filter((r) => r.status === "OVERDUE").length,
      collectedCents: rows.reduce((a, r) => a + r.paidCents, 0),
    },
  };
}

/** Estado de la mensualidad de un cliente para el mes en curso. */
export async function clientBillingStatus(org: { id: string; billingDay: number; createdAt: Date }) {
  const period = periodOf(new Date());
  const today = dayInTz(new Date(), APP_TIMEZONE);
  const pays = await db.query.payments.findMany({
    where: and(eq(payments.organizationId, org.id), isNull(payments.voidedAt)),
    columns: { period: true },
  });
  return {
    period,
    status: billingStatus({
      period,
      today,
      billingDay: org.billingDay,
      createdDay: dayInTz(org.createdAt),
      paidPeriods: new Set(pays.map((p) => p.period)),
    }),
  };
}

export async function listInstallations(orgId: string) {
  return db.query.installations.findMany({
    where: eq(installations.organizationId, orgId),
    orderBy: [asc(installations.revokedAt), desc(installations.lastSeenAt)],
  });
}

export async function listPayments(orgId: string) {
  return db.query.payments.findMany({
    where: eq(payments.organizationId, orgId),
    orderBy: [desc(payments.period), desc(payments.createdAt)],
  });
}

export async function listDemoRequests(status?: DemoRequestStatus) {
  return db.query.demoRequests.findMany({
    where: status ? eq(demoRequests.status, status) : undefined,
    orderBy: desc(demoRequests.createdAt),
    limit: 300,
  });
}

export async function demoRequestCounts() {
  const rows = await db
    .select({ status: demoRequests.status, n: sql<number>`count(*)::int` })
    .from(demoRequests)
    .groupBy(demoRequests.status);
  const out: Record<DemoRequestStatus, number> = { NEW: 0, CONTACTED: 0, CONVERTED: 0, DISCARDED: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

export async function listPlatformAdmins() {
  return db.query.users.findMany({
    where: eq(users.platformAdmin, true),
    orderBy: [desc(users.active), asc(users.name)],
    with: { organization: { columns: { name: true, internal: true } } },
    columns: { id: true, name: true, email: true, active: true, lastLoginAt: true, organizationId: true },
  });
}
