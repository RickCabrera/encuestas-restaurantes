/**
 * Mensualidades de los clientes (reglas puras, probadas en tests/unit/billing.test.ts).
 * Los pagos se capturan a mano en Administración → Pagos; nada corta el servicio automáticamente.
 */
import { APP_TIMEZONE, dayInTz } from "./dates";

export type BillingStatus = "PAID" | "PENDING" | "OVERDUE";

export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  PAID: "Pagado",
  PENDING: "Pendiente",
  OVERDUE: "Vencido",
};

export const PAYMENT_METHOD_LABEL = {
  TRANSFER: "Transferencia",
  CASH: "Efectivo",
  CARD: "Tarjeta",
  OTHER: "Otro",
} as const;

export const BILLING_DAY_MIN = 1;
export const BILLING_DAY_MAX = 28;

/** `YYYY-MM` del instante en la zona del negocio. */
export function periodOf(instant: Date, tz = APP_TIMEZONE) {
  return dayInTz(instant, tz).slice(0, 7);
}

export function isValidPeriod(p: string | null | undefined): p is string {
  return !!p && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

/** Mes anterior o siguiente de un `YYYY-MM`. */
export function shiftPeriod(period: string, months: number) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "octubre de 2026". */
export function formatPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
}

/** "1,250.50" o "1250" → centavos. null si no es un monto válido (> 0 y hasta 1 millón). */
export function parseMoney(raw: string): number | null {
  const clean = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents > 0 && cents <= 100_000_000 ? cents : null;
}

/**
 * Estado de la mensualidad de `period` para un cliente.
 * - Pagado: tiene al menos un pago no anulado de ese mes.
 * - Vencido: ya pasó su día de corte de ese mes (para meses anteriores, siempre).
 * - Pendiente: todavía no llega el día de corte, o el cliente se dio de alta ese mes después de su día de corte.
 */
export function billingStatus(opts: {
  period: string;
  today: string; // YYYY-MM-DD en la zona del negocio
  billingDay: number;
  createdDay: string; // YYYY-MM-DD en que se dio de alta
  paidPeriods: Set<string>;
}): BillingStatus {
  const { period, today, billingDay, createdDay, paidPeriods } = opts;
  if (paidPeriods.has(period)) return "PAID";
  const currentPeriod = today.slice(0, 7);
  if (period > currentPeriod) return "PENDING";
  const createdPeriod = createdDay.slice(0, 7);
  if (createdPeriod > period) return "PENDING";
  if (createdPeriod === period && Number(createdDay.slice(8, 10)) > billingDay) return "PENDING";
  if (period < currentPeriod) return "OVERDUE";
  return Number(today.slice(8, 10)) > billingDay ? "OVERDUE" : "PENDING";
}
