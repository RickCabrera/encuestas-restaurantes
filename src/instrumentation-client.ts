import * as Sentry from "@sentry/nextjs";

// Errores del navegador (panel, encuesta y tablets). Solo si hay DSN público.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.05,
  });
}
