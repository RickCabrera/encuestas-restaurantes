import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Para el monitor de disponibilidad (UptimeRobot, etc.): confirma que la app está arriba
 * sin tocar la base, para no mantenerla despierta. Con `?db=1` sí hace la consulta
 * (diagnóstico manual).
 */
export async function GET(request: Request) {
  const time = new Date().toISOString();
  if (new URL(request.url).searchParams.get("db") !== "1") {
    return NextResponse.json({ status: "ok", time });
  }
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", db: "ok", time });
  } catch {
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
