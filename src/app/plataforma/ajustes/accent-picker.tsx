"use client";

import { Check, Home } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { setAccentAction } from "@/app/actions/platform";
import { Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { ACCENT_PRESETS, accentPreset } from "@/lib/ui-theme";

/** Elegir el color de acento: se ve al instante en esta página y se guarda para todos al dar "Guardar color". */
export function AccentPicker({ current }: { current: string }) {
  const [selected, setSelected] = useState(current);
  const [state, action] = useActionState(setAccentAction, {} as ActionState);

  // Vista previa en vivo: cambia las variables del documento mientras se elige.
  useEffect(() => {
    const p = accentPreset(selected);
    const root = document.documentElement;
    root.style.setProperty("--accent", p.main);
    root.style.setProperty("--accent-dark", p.dark);
  }, [selected]);
  useEffect(
    () => () => {
      // Al salir sin guardar se vuelve al color de /theme.css.
      document.documentElement.style.removeProperty("--accent");
      document.documentElement.style.removeProperty("--accent-dark");
    },
    [],
  );

  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className="label">Color</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {ACCENT_PRESETS.map((p) => {
            const active = p.id === selected;
            return (
              <label
                key={p.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "border-ink bg-surface-2" : "border-line hover:border-ink-faint",
                )}
              >
                <input
                  type="radio"
                  name="accent"
                  value={p.id}
                  checked={active}
                  onChange={() => setSelected(p.id)}
                  className="sr-only"
                />
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: p.main }}>
                  {active ? <Check size={15} color="white" strokeWidth={3} aria-hidden /> : null}
                </span>
                {p.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <p className="label">Vista previa</p>
        <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-md)] border border-line bg-surface-2 p-4">
          <span className="inline-flex h-10 items-center rounded-[var(--radius-sm)] bg-basil px-4 text-sm font-medium text-white">
            Guardar cambios
          </span>
          <span className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-night px-3 text-sm font-medium text-white">
            <span className="inline-flex items-center gap-2 rounded-lg bg-basil px-3 py-1.5">
              <Home size={15} aria-hidden /> Resumen
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <span className="relative inline-flex h-6 w-11 rounded-full bg-basil">
              <span className="absolute top-0.5 left-[22px] h-5 w-5 rounded-full bg-white shadow" />
            </span>
            Encendido
          </span>
          <span className="link text-sm underline">Un enlace</span>
          <span className="inline-flex items-center rounded-full bg-basil-tint px-2 py-0.5 text-[12px] font-medium text-basil-ink">
            Activo
          </span>
        </div>
      </div>

      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      <SubmitButton className="w-full" size="lg" pendingText="Guardando…">
        Guardar color
      </SubmitButton>
      <p className="text-sm text-ink-soft" role="status">
        {state.ok
          ? "Listo. Ya se ve en todo el sistema; las páginas abiertas en otros equipos lo toman al recargar."
          : "Aquí lo ves aplicado en cuanto lo eliges. Las páginas abiertas en otros equipos lo toman al recargar."}
      </p>
    </form>
  );
}
