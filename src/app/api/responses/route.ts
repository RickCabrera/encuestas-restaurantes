import { after, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { logger } from "@/lib/logger";
import { pruneRateLimits, rateLimit } from "@/lib/rate-limit";
import { ipFromRequest } from "@/lib/request";
import { SubmitError, submitResponse, submitSchema } from "@/lib/submit-response";

/**
 * Recibe una respuesta de encuesta.
 * - Con `Authorization: Bearer <token de tablet>` → canal KIOSK.
 * - Sin token → canal QR (celular del comensal).
 */
export async function POST(req: Request) {
  const ip = ipFromRequest(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const hasToken = req.headers.get("authorization")?.startsWith("Bearer ");
  try {
    let result;
    if (hasToken) {
      const device = await authenticateDevice(req);
      if (!device) return NextResponse.json({ error: "Tablet no vinculada" }, { status: 401 });
      const rl = await rateLimit(`resp:device:${device.id}`, 120, 10 * 60);
      if (!rl.ok) return tooMany(rl.retryAfterSec);
      result = await submitResponse(parsed.data, {
        channel: "KIOSK",
        deviceId: device.id,
        restaurantId: device.restaurantId,
      });
    } else {
      const [global, perSurvey] = await Promise.all([
        rateLimit(`resp:ip:${ip}`, 30, 10 * 60),
        rateLimit(`resp:ip:${ip}:${parsed.data.surveyId}`, 5, 30 * 60),
      ]);
      if (!global.ok || !perSurvey.ok) return tooMany(Math.max(global.retryAfterSec, perSurvey.retryAfterSec));
      result = await submitResponse(parsed.data, { channel: "QR" });
    }

    if (result.alert) after(result.alert);
    if (Math.random() < 0.01) after(pruneRateLimits);
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (e) {
    if (e instanceof SubmitError) return NextResponse.json({ error: e.message }, { status: e.status });
    logger.error("response.error", { message: (e as Error).message, ip });
    throw e;
  }
}

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Recibimos demasiadas respuestas desde este dispositivo. Intenta más tarde." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
