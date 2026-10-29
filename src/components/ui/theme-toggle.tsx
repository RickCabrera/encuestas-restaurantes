"use client";

import { useState } from "react";
import { THEME_COOKIE } from "@/lib/ui-theme";

/**
 * Interruptor "Tema oscuro" de los paneles. Cambia el atributo data-theme del contenedor del
 * panel al instante y guarda la elección en una cookie de ese navegador (la lee el layout).
 */
export function ThemeToggle({ initial, targetId }: { initial: "light" | "dark"; targetId: string }) {
  const [dark, setDark] = useState(initial === "dark");
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-[14px] font-medium text-white/85">
      Tema oscuro
      <span className="relative inline-flex">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={dark}
          onChange={(e) => {
            const next = e.target.checked;
            setDark(next);
            const el = document.getElementById(targetId);
            if (el) el.dataset.theme = next ? "dark" : "light";
            document.cookie = `${THEME_COOKIE}=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
          }}
        />
        <span className="h-6 w-11 rounded-full bg-white/20 transition-colors peer-checked:bg-basil peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white" />
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Switch({ name, defaultChecked, label }: { name: string; defaultChecked?: boolean; label: React.ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-medium">
      <span className="relative inline-flex">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-basil peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-basil" />
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
      {label}
    </label>
  );
}
