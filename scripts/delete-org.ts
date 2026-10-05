/* Borra una cadena de prueba con TODO lo suyo (restaurantes, usuarios, encuestas, tablets, respuestas e invitaciones):
 *   npm run org:delete -- "<nombre exacto de la cadena>"
 *   npm run org:delete -- --id <id de la cadena>      (si hay dos con el mismo nombre)
 * Muestra lo que va a borrar y pide escribir el nombre otra vez. La cadena "Demo" nunca se borra.
 * Usa DATABASE_URL.
 */
import { createInterface } from "node:readline/promises";
import { isUuid } from "../src/lib/ids";
import {
  countOrganizationData,
  DEMO_ORG_NAME,
  deleteOrganization,
  findOrganizationToDelete,
  type OrgCounts,
} from "../src/lib/orgs";

const USAGE = 'Uso: npm run org:delete -- "<nombre exacto de la cadena>"   |   npm run org:delete -- --id <id>';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function describe(c: OrgCounts) {
  return [
    `  Restaurantes:  ${c.restaurants}`,
    `  Usuarios:      ${c.users}`,
    `  Encuestas:     ${c.surveys}`,
    `  Tablets:       ${c.devices}`,
    `  Respuestas:    ${c.responses}`,
    `  Invitaciones:  ${c.invites}`,
  ].join("\n");
}

/** Host y base a los que apunta DATABASE_URL, sin usuario ni contraseña. */
function databaseLabel() {
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    return `${u.host}${u.pathname}`;
  } catch {
    return "(DATABASE_URL no válida)";
  }
}

async function main() {
  const args = process.argv.slice(2);
  let by: { id: string } | { name: string };
  if (args[0] === "--id") {
    if (args.length !== 2 || !isUuid(args[1])) fail(USAGE);
    by = { id: args[1] };
  } else {
    if (args.length !== 1 || !args[0].trim() || args[0].startsWith("--")) fail(USAGE);
    by = { name: args[0] };
  }

  const found = await findOrganizationToDelete(by);
  if (!found.ok) {
    if (found.reason === "not_found") fail("No existe una cadena con ese nombre o id. No se borró nada.");
    if (found.reason === "protected") fail(`La cadena "${DEMO_ORG_NAME}" no se puede borrar. No se borró nada.`);
    console.error(`Hay ${found.matches.length} cadenas con ese nombre. No se borró nada. Elige una con --id:`);
    for (const o of found.matches) console.error(`  ${o.id}   creada el ${o.createdAt.toISOString()}`);
    process.exit(1);
  }

  const { org } = found;
  console.log(`Base de datos: ${databaseLabel()}`);
  console.log(`Se va a borrar la cadena "${org.name}" (${org.id}) con todo esto:`);
  console.log(describe(await countOrganizationData(org.id)));
  console.log("Esto no se puede deshacer.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Si la entrada se cierra sin respuesta (no hay terminal), cuenta como no confirmar.
  const typed = await Promise.race([
    rl.question("Escribe el nombre de la cadena para confirmar: "),
    new Promise<string>((resolve) => rl.once("close", () => resolve(""))),
  ]);
  rl.close();
  if (typed !== org.name) fail("El nombre no coincide. No se borró nada.");

  const deleted = await deleteOrganization(org.id);
  if (!deleted) fail("La cadena ya no existe. No se borró nada.");
  console.log(`Cadena "${deleted.org.name}" borrada:`);
  console.log(describe(deleted.counts));
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
