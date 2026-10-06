/* Versión instalada en PC (docs/INSTALAR-PC.md): pone una contraseña nueva a un administrador.
 * Ahí no hay correo de recuperación; lo usa el acceso directo "Restablecer contraseña de administrador".
 *   reset-admin-password --list            lista a los administradores
 *   reset-admin-password correo@x.com      con la contraseña nueva en la variable RESET_PASSWORD
 */
import bcrypt from "bcryptjs";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { organizations, users } from "../src/db/schema";
import { passwordSchema } from "../src/lib/password-rules";

async function listAdmins() {
  const rows = await db
    .select({ email: users.email, name: users.name, active: users.active, org: organizations.name })
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.role, "ADMIN"))
    .orderBy(asc(organizations.name), asc(users.email));
  if (rows.length === 0) {
    console.log('Todavía no hay administradores. Usa "Generar enlace de alta nuevo" para crear el primero.');
    return;
  }
  console.log("Administradores:");
  for (const r of rows) console.log(`  ${r.email}  (${r.name}, ${r.org}${r.active ? "" : ", desactivado"})`);
}

async function main() {
  const arg = process.argv[2];
  if (arg === "--list") {
    await listAdmins();
    process.exit(0);
  }
  const email = (arg ?? "").toLowerCase().trim();
  const password = passwordSchema.safeParse(process.env.RESET_PASSWORD ?? "");
  if (!email) {
    console.error("Falta el correo del administrador.");
    process.exit(1);
  }
  if (!password.success) {
    console.error(`Contraseña no válida: ${password.error.issues[0].message}.`);
    process.exit(1);
  }
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || user.role !== "ADMIN") {
    console.error(`No hay un administrador con el correo ${email}.`);
    process.exit(1);
  }
  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password.data, 10), active: true, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, user.id));
  console.log(`Contraseña cambiada para ${email}. Sus sesiones abiertas se cerraron.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
