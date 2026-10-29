import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { serverInstanceId } from "@/lib/instance";

export const dynamic = "force-dynamic";

/**
 * Para el monitor de disponibilidad (UptimeRobot, etc.): confirma que la app está arriba
 * sin tocar la base, para no mantenerla despierta. Con `?db=1` sí hace la consulta
 * (diagnóstico manual).
 *
 * `instance` identifica esta instalación: la app de las tablets lo usa para volver a encontrar
 * su servidor si la PC cambia de IP (android-tablet/, ServerFinder).
 */
export async function GET(request: Request) {
  const time = new Date().toISOString();
  const base = { status: "ok", app: "sobremesa", instance: serverInstanceId(), time };
  if (new URL(request.url).searchParams.get("db") !== "1") {
    return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ...base, db: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
