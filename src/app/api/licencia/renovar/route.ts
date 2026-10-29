import { NextResponse } from "next/server";
import { z } from "zod";
import { isLocalMode } from "@/lib/app-mode";
import { isUuid } from "@/lib/ids";
import { licenseSigningConfigured } from "@/lib/license-token";
import { renewInstallation } from "@/lib/licensing-server";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const statsSchema = z
  .object({
    orgNames: z.array(z.string().max(100)).max(20),
    restaurants: z.number().int().min(0).max(100000),
    tablets: z.number().int().min(0).max(100000),
    users: z.number().int().min(0).max(100000),
    responses30: z.number().int().min(0).max(10000000),
    lastResponseAt: z.string().max(40).nullable(),
  })
  .nullish();

const body = z.object({
  installationId: z.string().refine(isUuid),
  secret: z.string().min(20).max(200),
  version: z.string().max(50).nullish(),
  stats: statsSchema,
});

/** Renueva la licencia de una instalación en PC. Solo en la nube. */
export async function POST(req: Request) {
  if (isLocalMode()) return new Response(null, { status: 404 });
  if (!licenseSigningConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const limited = await rateLimit(`license:renew:${parsed.data.installationId}`, 60, 60 * 60);
  if (!limited.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const result = await renewInstallation(parsed.data);
  if (!result.ok) {
    logger.warn("license.renew_rejected", { installationId: parsed.data.installationId, reason: result.reason });
    return NextResponse.json({ error: result.reason }, { status: 403 });
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
