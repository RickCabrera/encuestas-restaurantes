"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Último recurso ante errores no controlados en cualquier pantalla. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="es-MX">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f3f5f2", color: "#1c2621" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
          <div>
            <h1 style={{ fontSize: 32, margin: 0 }}>Algo salió mal</h1>
            <p style={{ color: "#56625b" }}>Recarga la página. Si sigue pasando, avisa al administrador.</p>
            <button
              onClick={reset}
              style={{
                marginTop: 16,
                padding: "10px 20px",
                borderRadius: 8,
                border: 0,
                background: "#2f6b4f",
                color: "#fff",
                fontSize: 16,
              }}
            >
              Reintentar
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
