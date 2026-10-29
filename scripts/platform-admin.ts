/* Administrador de la plataforma (/plataforma), el equipo que opera Sobremesa.
 *
 *   npm run platform-admin -- correo@sobremesa.mx "Nombre" "Contraseña"
 *     Crea la cuenta (o, si el correo ya existe, la hace administrador y le pone esa contraseña).
 *
 *   npm run platform-admin            (sin argumentos, lo usa el despliegue en Railway)
 *     Lee PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD y PLATFORM_ADMIN_NAME. Si no están, no hace nada.
 *     Si la cuenta ya existe no le cambia la contraseña: solo se asegura de que sea administrador.
 */
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { getOrCreateInternalOrg } from "../src/lib/platform";

async function main() {
  const [argEmail, argName, argPassword] = process.argv.slice(2);
  const fromArgs = !!argEmail;
  const email = (argEmail ?? process.env.PLATFORM_ADMIN_EMAIL ?? "").toLowerCase().trim();
  const name = (argName ?? process.env.PLATFORM_ADMIN_NAME ?? "Administrador").trim();
  const password = argPassword ?? process.env.PLATFORM_ADMIN_PASSWORD ?? "";

  if (!email) {
    if (fromArgs) process.exit(1);
    console.log("PLATFORM_ADMIN_EMAIL no está definida: no se crea administrador de la plataforma.");
    process.exit(0);
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    const resetPassword = fromArgs && password.length >= 8;
    await db
      .update(users)
      .set({
        platformAdmin: true,
        active: true,
        ...(resetPassword
          ? { passwordHash: await bcrypt.hash(password, 10), sessionVersion: sql`${users.sessionVersion} + 1` }
          : {}),
      })
      .where(eq(users.id, existing.id));
    console.log(`Administrador de la plataforma listo: ${email}${resetPassword ? " (contraseña actualizada)" : ""}`);
    process.exit(0);
  }

  if (password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres (PLATFORM_ADMIN_PASSWORD).");
    process.exit(fromArgs ? 1 : 0);
  }
  const org = await getOrCreateInternalOrg();
  await db.insert(users).values({
    organizationId: org.id,
    email,
    name,
    passwordHash: await bcrypt.hash(password, 10),
    role: "ADMIN",
    platformAdmin: true,
  });
  console.log(`Administrador de la plataforma creado: ${email}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
