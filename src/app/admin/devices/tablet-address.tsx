"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Versión instalada en PC: la dirección que se escribe en la app de las tablets. */
export function TabletAddress({ url }: { url: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    input.current?.select();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Por http en la red local no existe navigator.clipboard: se copia la selección.
      setCopied(document.execCommand("copy"));
    }
  };
  return (
    <div className="panel mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
      <label htmlFor="tablet-address" className="font-medium">
        Dirección para las tablets
      </label>
      <div className="flex min-w-0 flex-1 gap-2">
        <input
          id="tablet-address"
          ref={input}
          readOnly
          value={url}
          className="input min-w-0 flex-1 font-mono text-[15px]"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button variant="secondary" onClick={copy}>
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <p className="w-full text-sm text-ink-soft" aria-live="polite">
        Es la que pide la app de las tablets en “Dirección del servidor”. Funciona en equipos conectados a la red del restaurante.
      </p>
    </div>
  );
}
