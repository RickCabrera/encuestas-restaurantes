import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

/**
 * Rate limit de ventana fija respaldado en Postgres (una sola sentencia atómica),
 * así funciona igual con varias instancias serverless.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const rows = await db.execute<{ count: number; window_start: Date }>(sql`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec})
                   THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec})
                   THEN now() ELSE rate_limits.window_start END
    RETURNING count, window_start
  `);
  const row = rows[0];
  const count = Number(row.count);
  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: Math.max(1, Math.ceil(windowSec - elapsed)),
  };
}

export async function resetRateLimit(key: string) {
  await db.execute(sql`DELETE FROM rate_limits WHERE key = ${key}`);
}

/** Limpieza oportunista de contadores viejos (se llama de vez en cuando). */
export async function pruneRateLimits() {
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
}
