"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Diálogo modal accesible basado en <dialog> nativo. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-[var(--radius-lg)] border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-ink-soft hover:bg-line-soft" aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>
      <div className="px-5 py-5">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-4">{footer}</div> : null}
    </dialog>
  );
}
