/* Crea (o actualiza la contraseña de) un administrador en producción:
 *   npm run create-admin -- correo@cliente.com "Nombre" "Contraseña"
 */
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";

async function main() {
  const [email, name, password] = process.argv.slice(2);
  if (!email || !name || !password || password.length < 8) {
    console.error('Uso: npm run create-admin -- correo@cliente.com "Nombre" "Contraseña (mín. 8)"');
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
    await db.insert(users).values({ email: email.toLowerCase(), name, passwordHash, role: "ADMIN", notifyLowScores: true });
    console.log(`Administrador creado: ${email}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
