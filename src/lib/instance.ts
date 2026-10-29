import { sha256 } from "@/lib/crypto";

/**
 * Identificador estable de esta instalación. La app de las tablets lo guarda para reconocer su
 * servidor aunque cambie de IP, y para no conectarse por error a otro servidor de encuestas que
 * haya quedado en la dirección anterior.
 *
 * Se deriva de AUTH_SECRET (aleatorio por instalación y que no cambia), así existe también en
 * instalaciones anteriores sin tocar su configuración. Es un hash con prefijo propio: no revela
 * el secreto.
 */
export function serverInstanceId(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return sha256(`sobremesa:instance:${secret}`).slice(0, 24);
}
