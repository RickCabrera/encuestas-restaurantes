"use client";

import { Delete } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Teclado numérico grande para tablets (código de vinculación y PIN). */
export function Keypad({
  length,
  maxLength = length,
  onSubmit,
  submitLabel,
  error,
  busy,
  masked,
}: {
  length: number;
  maxLength?: number;
  onSubmit: (value: string) => void;
  submitLabel: string;
  error?: string | null;
  busy?: boolean;
  masked?: boolean;
}) {
  const [value, setValue] = useState("");
  const press = (d: string) => setValue((v) => (v.length < maxLength ? v + d : v));
  const ready = value.length >= length && !busy;

  // También acepta el teclado físico (útil al vincular desde una computadora).
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => {
    submitRef.current = () => {
      if (!ready) return;
      onSubmit(value);
      setValue("");
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setValue((v) => v.slice(0, -1));
      else if (e.key === "Enter") submitRef.current();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-2 flex justify-center gap-2" aria-live="polite" aria-label={`${value.length} dígitos escritos`}>
        {Array.from({ length: maxLength }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex h-14 w-11 items-center justify-center rounded-lg border-2 font-display text-3xl font-semibold tabular-nums",
              i < value.length ? "border-ink bg-surface" : "border-line bg-surface/60",
              i >= length && i >= value.length ? "opacity-40" : "",
            )}
          >
            {i < value.length ? (masked ? "•" : value[i]) : ""}
          </span>
        ))}
      </div>
      <p className="mb-4 min-h-6 text-center text-[15px] leading-6 text-chile" role="alert">
        {/* El error se oculta en cuanto se empieza a escribir un código nuevo. */}
        {value.length === 0 ? (error ?? "") : ""}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <KeyButton key={d} onClick={() => press(d)}>
            {d}
          </KeyButton>
        ))}
        <KeyButton onClick={() => setValue("")} aria-label="Borrar todo" className="text-base font-medium text-ink-soft">
          Borrar
        </KeyButton>
        <KeyButton onClick={() => press("0")}>0</KeyButton>
        <KeyButton onClick={() => setValue((v) => v.slice(0, -1))} aria-label="Borrar un dígito">
          <Delete size={26} />
        </KeyButton>
      </div>
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          onSubmit(value);
          setValue("");
        }}
        className="mt-5 h-16 w-full rounded-2xl bg-basil font-display text-xl font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {busy ? "Verificando…" : submitLabel}
      </button>
    </div>
  );
}

function KeyButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-16 items-center justify-center rounded-2xl border border-line bg-surface font-display text-3xl font-semibold text-ink transition-transform active:scale-95 active:bg-line-soft",
        className,
      )}
      {...props}
    />
  );
}
