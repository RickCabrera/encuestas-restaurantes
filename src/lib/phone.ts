/**
 * Celulares de México para el programa de puntos. Se guardan como 10 dígitos, sin lada de país.
 * Lo usan la pantalla del comensal (para validar antes de enviar) y el servidor.
 */

/** Normaliza a 10 dígitos o devuelve null si no parece un celular válido. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.replace(/\D/g, "");
  // +52 / 52, y el "1" que se marcaba antes del celular (+52 1 ...).
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  if (!/^[1-9]\d{9}$/.test(d)) return null;
  // Números de relleno (0000000000, 5555555555...).
  if (/^(\d)\1{9}$/.test(d)) return null;
  return d;
}

/** 5512345678 → "55 1234 5678". */
export function formatPhone(phone: string) {
  return phone.length === 10 ? `${phone.slice(0, 2)} ${phone.slice(2, 6)} ${phone.slice(6)}` : phone;
}

/** 5512345678 → "•• •••• 5678" (para mostrar sin exponer el número completo). */
export function maskPhone(phone: string) {
  return phone.length === 10 ? `•• •••• ${phone.slice(6)}` : phone;
}
