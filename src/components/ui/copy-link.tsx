"use client";

import { useRef, useState } from "react";
import { Button } from "./button";

/** Enlace de un solo uso con botón para copiarlo. */
export function CopyLink({ link, note }: { link: string; note?: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          ref={input}
          readOnly
          value={link}
          aria-label="Enlace"
          className="input min-w-0 flex-1 font-mono text-[13px]"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          onClick={async () => {
            input.current?.select();
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              setCopied(document.execCommand("copy"));
            }
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      {note ? <p className="text-sm text-ink-soft">{note}</p> : null}
    </div>
  );
}
