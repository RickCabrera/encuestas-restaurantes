/* Crea una invitación de administrador de un solo uso para una cadena que YA existe e imprime el enlace:
 *   npm run invite:admin                                   (cadena "Demo")
 *   npm run invite:admin -- "<nombre exacto de la cadena>"
 * Para dar de alta una cadena nueva usa `npm run invite:org`.
 * Usa DATABASE_URL y APP_URL. El enlace solo se muestra aquí: en la base queda su hash.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { organizations } from "../src/db/schema";
import { createInvite, INVITE_DAYS, inviteLink } from "../src/lib/invites";
import { DEMO_ORG_NAME } from "../src/lib/orgs";

async function main() {
  const base = process.env.APP_URL;
  if (!base) {
    console.error("APP_URL no está configurada (se usa para armar el enlace).");
    process.exit(1);
  }
  const orgName = process.argv[2] ?? DEMO_ORG_NAME;
  const orgs = await db.select().from(organizations).where(eq(organizations.name, orgName));
  if (orgs.length !== 1) {
    console.error(
      orgs.length === 0
        ? `No existe la cadena "${orgName}".`
        : `Hay ${orgs.length} cadenas llamadas "${orgName}"; no se creó nada.`,
    );
    process.exit(1);
  }
  const { token, expiresAt } = await createInvite({ organizationId: orgs[0].id, role: "ADMIN" });
  console.log(`Invitación de administrador para la cadena "${orgs[0].name}". Enlace de un solo uso:`);
  console.log(`\n  ${inviteLink(base, token)}\n`);
  console.log(`Vence en ${INVITE_DAYS} días (${expiresAt.toISOString()}).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
