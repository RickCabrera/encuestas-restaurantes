import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { surveys } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { restaurantScope } from "@/lib/authz";
import { isUuid } from "@/lib/ids";

/**
 * Encuesta con sus preguntas y su restaurante: undefined si no existe, es de otra cadena o
 * el usuario no tiene asignado ese restaurante.
 */
export async function getAccessibleSurvey(user: SessionUser, id: string) {
  if (!isUuid(id)) return undefined;
  return db.query.surveys.findFirst({
    where: and(eq(surveys.id, id), restaurantScope(user, surveys.restaurantId)),
    with: {
      questions: { orderBy: (q, { asc }) => asc(q.position) },
      restaurant: { columns: { logoData: false } },
    },
  });
}
