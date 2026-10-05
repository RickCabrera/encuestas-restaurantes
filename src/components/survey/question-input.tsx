"use client";

import { cn } from "@/lib/cn";
import type { AnswerValue, RunnerQuestion } from "./types";

type Props = {
  question: RunnerQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
};

const choiceBtn =
  "flex items-center justify-center rounded-[14px] border-2 border-line bg-surface font-display font-semibold text-ink transition-[border-color,background-color,transform] active:scale-[0.97] hover:border-ink-faint aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand)] aria-pressed:text-[var(--brand-ink)]";

export function QuestionInput({ question, value, onChange }: Props) {
  switch (question.type) {
    case "YES_NO":
      return (
        <div className="flex flex-wrap justify-center gap-4" role="group" aria-label={question.text}>
          {[
            [true, "Sí"],
            [false, "No"],
          ].map(([v, label]) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={value === v}
              onClick={() => onChange(v as boolean)}
              className={cn(choiceBtn, "h-24 w-40 text-[28px] @2xl:h-28 @2xl:w-48")}
            >
              {label as string}
            </button>
          ))}
        </div>
      );

    case "RATING_5":
      return <Stars value={typeof value === "number" ? value : undefined} onChange={onChange} label={question.text} />;

    case "NPS_10":
      return <Nps value={typeof value === "number" ? value : undefined} onChange={onChange} label={question.text} />;

    case "SINGLE_CHOICE":
      return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-3" role="group" aria-label={question.text}>
          {(question.options?.choices ?? []).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={value === c}
              onClick={() => onChange(c)}
              className={cn(choiceBtn, "min-h-16 px-6 py-3 text-xl")}
            >
              {c}
            </button>
          ))}
        </div>
      );

    case "TEXT":
      return (
        <div className="mx-auto w-full max-w-xl">
          <label htmlFor={`q-${question.id}`} className="sr-only">
            {question.text}
          </label>
          <textarea
            id={`q-${question.id}`}
            rows={5}
            maxLength={1000}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Escribe aquí (opcional)"
            className="block w-full resize-none rounded-[14px] border-2 border-line bg-surface p-4 text-lg text-ink placeholder:text-ink-faint focus:border-[var(--brand)] focus:outline-none"
          />
          <p className="mt-2 text-right text-sm text-ink-faint">{typeof value === "string" ? value.length : 0}/1000</p>
        </div>
      );
  }
}

const STAR_LABELS = ["Muy mala", "Mala", "Regular", "Buena", "Excelente"];

function Stars({ value, onChange, label }: { value?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-0.5 @sm:gap-1 @2xl:gap-3" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value !== undefined && n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} de 5: ${STAR_LABELS[n - 1]}`}
              onClick={() => onChange(n)}
              className="rounded-xl p-1.5 transition-transform active:scale-90"
            >
              <svg viewBox="0 0 24 24" className="h-11 w-11 @sm:h-14 @sm:w-14 @2xl:h-20 @2xl:w-20" aria-hidden>
                <path
                  d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z"
                  fill={filled ? "var(--color-mustard)" : "transparent"}
                  stroke={filled ? "var(--color-mustard)" : "var(--color-ink-faint)"}
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          );
        })}
      </div>
      <p className="h-7 font-display text-xl text-ink-soft" aria-live="polite">
        {value ? STAR_LABELS[value - 1] : ""}
      </p>
    </div>
  );
}

function npsTone(n: number) {
  if (n <= 6) return "var(--color-chile)";
  if (n <= 8) return "var(--color-mustard)";
  return "var(--color-basil)";
}

function Nps({ value, onChange, label }: { value?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="grid grid-cols-6 gap-2 @2xl:grid-cols-11" role="radiogroup" aria-label={label}>
        {Array.from({ length: 11 }, (_, n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(n)}
              style={
                selected
                  ? { background: npsTone(n), borderColor: npsTone(n), color: n <= 8 && n > 6 ? "#1c2621" : "#fff" }
                  : undefined
              }
              className="flex aspect-square items-center justify-center rounded-[12px] border-2 border-line bg-surface font-display text-2xl font-semibold text-ink transition-transform hover:border-ink-faint active:scale-95"
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between text-sm text-ink-soft">
        <span>0 = Nada probable</span>
        <span>10 = Muy probable</span>
      </div>
    </div>
  );
}
