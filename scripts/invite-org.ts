/* Crea una invitación de un solo uso para dar de alta una CADENA NUEVA e imprime el enlace de registro:
 *   npm run invite:org
 * Quien abra el enlace escribe el nombre de su cadena y queda como su administrador.
 * Usa DATABASE_URL y APP_URL. El enlace solo se muestra aquí: en la base queda su hash.
 * Cada ejecución genera un enlace distinto.
 */
import { createOrgInvite, INVITE_DAYS, inviteLink } from "../src/lib/invites";

async function main() {
  const base = process.env.APP_URL;
  if (!base) {
    console.error("APP_URL no está configurada (se usa para armar el enlace).");
    process.exit(1);
  }
  const { token, expiresAt } = await createOrgInvite();
  console.log("Invitación de cadena nueva creada. Enlace de un solo uso:");
  console.log(`\n  ${inviteLink(base, token)}\n`);
  console.log(`Vence en ${INVITE_DAYS} días (${expiresAt.toISOString()}).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
