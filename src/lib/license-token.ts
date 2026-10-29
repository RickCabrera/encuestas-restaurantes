// Sin "server-only": lo usan las pruebas. Nunca se importa desde componentes de cliente.
import { createPrivateKey, createPublicKey } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

/**
 * Licencias de las instalaciones en PC. La nube las firma con una llave privada Ed25519
 * (LICENSE_PRIVATE_KEY, solo en Railway) y la PC las verifica con la llave pública de aquí,
 * sin internet. Así una PC no puede fabricarse su propia licencia.
 */
const PUBLIC_KEY_DER_BASE64 = "MCowBQYDK2VwAyEAGdkKtJeR1y92gF5tqDK7Hn4kae2zB+GWe4oCwyrF7xw=";

const ISSUER = "sobremesa";
const AUDIENCE = "sobremesa-pc";

/** Días que la PC puede seguir sin conectarse a la nube antes de bloquearse. */
export const LICENSE_DAYS = 7;
/**
 * Cada cuánto revisa la PC con la nube mientras se usa (panel, tablets o QR). Así, desactivar al
 * cliente o dar de baja la PC surte efecto en minutos si la PC tiene internet.
 */
export const LICENSE_CHECK_EVERY_MS = 5 * 60 * 1000;

export type LicenseClaims = {
  installationId: string;
  organizationId: string;
  organizationName: string;
  issuedAt: Date;
  expiresAt: Date;
};

function publicKey() {
  // Solo las pruebas pueden cambiar la llave pública: en una PC no se puede sustituir por configuración.
  const der =
    process.env.VITEST && process.env.LICENSE_PUBLIC_KEY_TEST ? process.env.LICENSE_PUBLIC_KEY_TEST : PUBLIC_KEY_DER_BASE64;
  return createPublicKey({ key: Buffer.from(der, "base64"), format: "der", type: "spki" });
}

export function licenseSigningConfigured() {
  return !!process.env.LICENSE_PRIVATE_KEY;
}

export async function signLicense(c: { installationId: string; organizationId: string; organizationName: string }) {
  const raw = process.env.LICENSE_PRIVATE_KEY;
  if (!raw) throw new Error("LICENSE_PRIVATE_KEY no está configurada");
  const key = createPrivateKey({ key: Buffer.from(raw.trim(), "base64"), format: "der", type: "pkcs8" });
  return new SignJWT({ org: c.organizationId, orgName: c.organizationName })
    .setProtectedHeader({ alg: "EdDSA" })
    .setSubject(c.installationId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${LICENSE_DAYS}d`)
    .sign(key);
}

/** Claims de una licencia válida y vigente, o null si está alterada, es de otra llave o ya venció. */
export async function verifyLicense(token: string | null | undefined): Promise<LicenseClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, publicKey(), { algorithms: ["EdDSA"], issuer: ISSUER, audience: AUDIENCE });
    if (!payload.sub || typeof payload.org !== "string" || !payload.exp || !payload.iat) return null;
    return {
      installationId: payload.sub,
      organizationId: payload.org,
      organizationName: typeof payload.orgName === "string" ? payload.orgName : "",
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch {
    return null;
  }
}
