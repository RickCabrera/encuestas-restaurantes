import "server-only";
import { and, eq, gte, lt, type SQL } from "drizzle-orm";
import { cookies } from "next/headers";
import { responses } from "@/db/schema";
import type { SessionUser } from "./auth";
import { canAccessRestaurant, restaurantScope } from "./authz";
import { addDays, dayInTz, isValidDay, startOfDayInTz } from "./dates";
import { isUuid } from "./ids";

export const RESTAURANT_COOKIE = "rest";

export type Filters = {
  restaurantId: string | null; // null = todos los permitidos
  from: string; // YYYY-MM-DD (incluido)
  to: string; // YYYY-MM-DD (incluido)
  channel: "KIOSK" | "QR" | null;
  surveyId: string | null;
  table: string | null;
  lowOnly: boolean;
  q: string | null;
  page: number;
};

type SP = Record<string, string | string[] | undefined>;

function one(sp: SP, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Lee los filtros de la URL, con el restaurante elegido en el selector global como respaldo. */
export async function parseFilters(sp: SP, user: SessionUser, defaultDays = 30): Promise<Filters> {
  const jar = await cookies();
  const today = dayInTz(new Date());
  let restaurantId = one(sp, "restaurant") ?? jar.get(RESTAURANT_COOKIE)?.value ?? null;
  if (restaurantId === "all" || (restaurantId && !canAccessRestaurant(user, restaurantId))) restaurantId = null;
  const fromRaw = one(sp, "from");
  const toRaw = one(sp, "to");
  let to = isValidDay(toRaw) ? toRaw : today;
  let from = isValidDay(fromRaw) ? fromRaw : addDays(to, -(defaultDays - 1));
  if (from > to) [from, to] = [to, from];
  const channelRaw = one(sp, "channel");
  const page = Math.max(1, Number(one(sp, "page")) || 1);
  return {
    restaurantId,
    from,
    to,
    channel: channelRaw === "KIOSK" || channelRaw === "QR" ? channelRaw : null,
    surveyId: isUuid(one(sp, "survey")) ? one(sp, "survey")! : null,
    table: one(sp, "table")?.trim() || null,
    lowOnly: one(sp, "low") === "1",
    q: one(sp, "q")?.trim() || null,
    page,
  };
}

/** Condiciones SQL sobre la tabla `responses` para los filtros y el alcance del usuario. */
export function responseWhere(f: Filters, user: SessionUser, extra: (SQL | undefined)[] = []) {
  return and(
    restaurantScope(user, responses.restaurantId),
    f.restaurantId ? eq(responses.restaurantId, f.restaurantId) : undefined,
    gte(responses.submittedAt, startOfDayInTz(f.from)),
    lt(responses.submittedAt, startOfDayInTz(addDays(f.to, 1))),
    f.channel ? eq(responses.channel, f.channel) : undefined,
    f.surveyId ? eq(responses.surveyId, f.surveyId) : undefined,
    f.table ? eq(responses.tableRef, f.table) : undefined,
    f.lowOnly ? eq(responses.lowScore, true) : undefined,
    ...extra,
  );
}

/** Serializa filtros a query string (para enlaces y exportación). */
export function filtersToQuery(f: Partial<Filters>, overrides: Record<string, string | null> = {}) {
  const p = new URLSearchParams();
  if (f.restaurantId) p.set("restaurant", f.restaurantId);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.channel) p.set("channel", f.channel);
  if (f.surveyId) p.set("survey", f.surveyId);
  if (f.table) p.set("table", f.table);
  if (f.lowOnly) p.set("low", "1");
  if (f.q) p.set("q", f.q);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
