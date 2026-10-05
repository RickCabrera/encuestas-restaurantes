"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/button";

/** Genera un PDF con un QR por mesa (el número de mesa queda en cada respuesta). */
export function TableQrForm({ restaurantId }: { restaurantId: string }) {
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(20);
  const valid = from >= 1 && to >= from && to - from < 200;
  return (
    <div className="border-t border-line-soft pt-5">
      <p className="mb-3 text-sm font-medium">QR por mesa</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">Desde la mesa</span>
          <input type="number" min={1} value={from} onChange={(e) => setFrom(Number(e.target.value))} className="input w-24" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">Hasta la mesa</span>
          <input type="number" min={1} value={to} onChange={(e) => setTo(Number(e.target.value))} className="input w-24" />
        </label>
        <a
          aria-disabled={!valid}
          className={buttonClass("secondary", "md", !valid ? "pointer-events-none opacity-50" : "")}
          href={`/api/qr/${restaurantId}?format=pdf&tables=${from}-${to}`}
        >
          Descargar PDF de mesas
        </a>
      </div>
      {valid ? (
        <p className="hint">Seis tarjetas por hoja carta, con el número de mesa. Máximo 200 mesas por archivo.</p>
      ) : (
        <p className="field-error" role="alert">
          {from < 1
            ? "La primera mesa debe ser 1 o mayor."
            : to < from
              ? "“Hasta” debe ser mayor o igual que “Desde”."
              : "Máximo 200 mesas por archivo."}
        </p>
      )}
    </div>
  );
}
