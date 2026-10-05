import "server-only";
import { logger } from "./logger";

type Mail = { to: string[]; subject: string; text: string; html?: string };

/**
 * Envía correo vía la API HTTP de Resend. Sin RESEND_API_KEY el correo se
 * escribe en el log (útil en desarrollo).
 */
export async function sendEmail(mail: Mail) {
  if (mail.to.length === 0) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.info("email.skipped_no_provider", { to: mail.to, subject: mail.subject, text: mail.text });
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Encuestas <onboarding@resend.dev>",
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
    if (!res.ok) logger.error("email.failed", { status: res.status, body: await res.text() });
  } catch (e) {
    logger.error("email.error", { message: (e as Error).message });
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
