"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel max-w-xl p-6">
      <h1 className="text-xl font-semibold">No se pudo cargar esta sección</h1>
      <p className="mt-2 text-ink-soft">
        Reintenta en unos segundos. Si el problema sigue, comparte este código con soporte: {error.digest ?? "sin código"}.
      </p>
      <Button className="mt-5" onClick={reset}>
        Reintentar
      </Button>
    </div>
  );
}
