import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { logoUrl } from "@/lib/ids";
import { getActiveRunnerSurvey } from "@/lib/queries/public";
import { getRestaurant } from "@/lib/queries/restaurants";

export const dynamic = "force-dynamic";

/** Configuración que descarga la tablet: restaurante, tiempos, PIN y encuesta activa. */
export async function GET(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return NextResponse.json({ error: "Tablet no vinculada" }, { status: 401 });
  const r = await getRestaurant(device.restaurantId);
  if (!r) return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 });
  const survey = r.active ? await getActiveRunnerSurvey(r.id) : null;
  return NextResponse.json(
    {
      device: { id: device.id, name: device.name },
      restaurant: {
        id: r.id,
        name: r.name,
        active: r.active,
        primaryColor: r.primaryColor,
        logoUrl: r.logoMime ? logoUrl(r) : null,
        resetSeconds: r.kioskResetSeconds,
        idleSeconds: r.kioskIdleSeconds,
        pinHash: r.kioskPinHash,
      },
      survey,
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
