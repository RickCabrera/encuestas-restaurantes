import { NextResponse } from "next/server";
import { z } from "zod";
import { isLocalMode } from "@/lib/app-mode";
import { licenseSigningConfigured } from "@/lib/license-token";
import { activateInstallation } from "@/lib/licensing-server";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { appUrl, ipFromRequest } from "@/lib/request";

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
  email: z.string().max(200),
  password: z.string().max(200),
  name: z.string().max(200).default("PC"),
  deviceKey: z.string().min(20).max(200).nullish(),
  version: z.string().max(50).nullish(),
  stats: statsSchema,
});

/** Activa una instalación en PC (el .exe) con la cuenta de administrador del negocio. Solo en la nube. */
export async function POST(req: Request) {
  if (isLocalMode()) return new Response(null, { status: 404 });
  if (!licenseSigningConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const ip = ipFromRequest(req);
  const limited = await rateLimit(`license:activate:${ip}`, 10, 15 * 60);
  if (!limited.ok) return NextResponse.json({ error: "rate_limited", retryAfterSec: limited.retryAfterSec }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await activateInstallation({ ...parsed.data, baseUrl: await appUrl() });
  if (!result.ok) {
    logger.warn("license.activate_rejected", { ip, reason: result.reason });
    return NextResponse.json({ error: result.reason }, { status: result.reason === "credentials" ? 401 : 403 });
  }
  logger.info("license.activated", {
    mode: result.mode,
    ...("installationId" in result ? { installationId: result.installationId } : {}),
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
