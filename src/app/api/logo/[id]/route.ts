import { eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import { isUuid } from "@/lib/ids";

/** Logo público del restaurante (se muestra en la encuesta). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("No encontrado", { status: 404 });
  const r = await db.query.restaurants.findFirst({
    where: eq(restaurants.id, id),
    columns: { logoData: true, logoMime: true },
  });
  if (!r?.logoData || !r.logoMime) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(r.logoData), {
    headers: {
      "Content-Type": r.logoMime,
      // La URL lleva ?v=<fecha de actualización>, así que se puede cachear mucho tiempo.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
