import { createHash, randomBytes, randomInt } from "node:crypto";

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Hash del PIN de kiosko. Se entrega solo a tablets vinculadas para que puedan
 * validar el PIN incluso sin internet (el PIN solo protege salir del modo
 * kiosko en esa tablet). Debe coincidir con `hashPin` en src/components/kiosk/storage.ts.
 */
export function kioskPinHash(restaurantId: string, pin: string) {
  return sha256(`kiosk:${restaurantId}:${pin}`);
}
