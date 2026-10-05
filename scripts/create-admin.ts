/* Crea (o actualiza la contraseña de) un administrador en producción:
 *   npm run create-admin -- correo@cliente.com "Nombre" "Contraseña" ["Nombre exacto de la cadena"]
 * Sin cadena, la cuenta nueva se crea en "Demo". Una cuenta que ya existe se queda en su cadena.
 */
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { organizations, users } from "../src/db/schema";
import { DEMO_ORG_NAME } from "../src/lib/orgs";

async function main() {
  const [email, name, password, orgName = DEMO_ORG_NAME] = process.argv.slice(2);
  if (!email || !name || !password || password.length < 8) {
    console.error('Uso: npm run create-admin -- correo@cliente.com "Nombre" "Contraseña (mín. 8)" ["Cadena"]');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, role: "ADMIN", active: true, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, existing.id));
    console.log(`Administrador actualizado: ${email}`);
  } else {
    const orgs = await db.select().from(organizations).where(eq(organizations.name, orgName));
    if (orgs.length !== 1) {
      console.error(
        orgs.length === 0
          ? `No existe la cadena "${orgName}".`
          : `Hay ${orgs.length} cadenas llamadas "${orgName}"; no se creó nada.`,
      );
      process.exit(1);
    }
    await db
      .insert(users)
      .values({
        organizationId: orgs[0].id,
        email: email.toLowerCase(),
        name,
        passwordHash,
        role: "ADMIN",
        notifyLowScores: true,
      });
    console.log(`Administrador creado en la cadena "${orgs[0].name}": ${email}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
