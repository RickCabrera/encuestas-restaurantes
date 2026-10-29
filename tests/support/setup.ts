// Las pruebas usan una BD separada. Por defecto: encuestas_test local.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/encuestas_test";
process.env.AUTH_SECRET ??= "test-secret-0123456789abcdef0123456789abcdef";
process.env.APP_TIMEZONE ??= "America/Mexico_City";

// Llaves de licencia solo para las pruebas (la llave pública real está en src/lib/license-token.ts).
import { generateKeyPairSync } from "node:crypto";
if (!process.env.LICENSE_PUBLIC_KEY_TEST) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  process.env.LICENSE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  process.env.LICENSE_PUBLIC_KEY_TEST = publicKey.export({ type: "spki", format: "der" }).toString("base64");
}
