/**
 * APP_MODE=local es la versión que se instala en una PC del restaurante (docs/INSTALAR-PC.md):
 * se usa por http://IP-de-la-PC:3000 en la red local, sin HTTPS. Sin esa variable (nube) nada cambia.
 *
 * El servidor la lee al arrancar. El navegador recibe NEXT_PUBLIC_APP_MODE, que next.config.ts
 * fija al compilar con APP_MODE=local.
 */
export function isLocalMode() {
  return process.env.NEXT_PUBLIC_APP_MODE === "local" || process.env.APP_MODE === "local";
}

/** Por http el navegador descarta las cookies `secure`: en modo local la sesión va sin ese flag. */
export function secureCookies() {
  return process.env.NODE_ENV === "production" && !isLocalMode();
}
