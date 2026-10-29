import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { installations } from "@/db/schema";
import { isLocalMode } from "@/lib/app-mode";
import { isUuid } from "@/lib/ids";
import { authenticateInstallation } from "@/lib/licensing-server";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { applyChanges, exportChanges } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({
  installationId: z.string().refine(isUuid),
  secret: z.string().min(20).max(200),
  push: z
    .object({
      tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown())).max(5000)).default({}),
      deletions: z
        .array(z.object({ table: z.string().max(40), key: z.string().max(80) }))
        .max(5000)
        .default([]),
    })
    .default({ tables: {}, deletions: [] }),
  pulled: z.record(z.string(), z.number().int().min(0)).default({}),
});

/**
 * Sincronización de una PC en modo SYNC: aplica lo que la PC cambió (solo dentro de su cadena) y le
 * devuelve lo que cambió en la nube después de sus cursores. Solo en la nube.
 */
export async function POST(req: Request) {
  if (isLocalMode()) return new Response(null, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const d = parsed.data;
  const limited = await rateLimit(`sync:${d.installationId}`, 240, 60 * 60);
  if (!limited.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const inst = await authenticateInstallation(d.installationId, d.secret);
  if (!inst) return NextResponse.json({ error: "revoked" }, { status: 403 });
  if (inst.organization.pcMode !== "SYNC")
    return NextResponse.json({ error: "mode", mode: inst.organization.pcMode }, { status: 409 });

  const org = inst.organizationId;
  const applied = await applyChanges(org, d.push, "cloud");
  const changes = await exportChanges(org, d.pulled);
  await db.update(installations).set({ lastSyncAt: new Date(), lastSeenAt: new Date() }).where(eq(installations.id, inst.id));
  if (applied.skipped.length) logger.warn("sync.skipped", { installationId: inst.id, skipped: applied.skipped.slice(0, 20) });
  return NextResponse.json(
    { ...changes, applied: applied.applied, skipped: applied.skipped },
    { headers: { "Cache-Control": "no-store" } },
  );
}
