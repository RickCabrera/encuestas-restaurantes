"use client";

import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { QuestionInput } from "./question-input";
import { type AnswerValue, readableOn, type RunnerRestaurant, type RunnerSurvey, type SubmitPayload, uuid } from "./types";

type Stage = "welcome" | "questions" | "submitting" | "done" | "error";

export type SurveyRunnerProps = {
  survey: RunnerSurvey;
  restaurant: RunnerRestaurant;
  /** Envía la respuesta. Debe lanzar error si no se pudo guardar. */
  onSubmit: (payload: SubmitPayload) => Promise<void>;
  /** Mostrar la pantalla de bienvenida antes de la primera pregunta. */
  showWelcome?: boolean;
  /** Se llama al terminar (el kiosko la usa para reiniciar). */
  onDone?: () => void;
  /** Se llama con cada interacción (el kiosko reinicia su temporizador de inactividad). */
  onActivity?: () => void;
  /** Texto pequeño bajo el mensaje final. */
  doneNote?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function SurveyRunner({
  survey,
  restaurant,
  onSubmit,
  showWelcome = true,
  onDone,
  onActivity,
  doneNote,
  footer,
  className,
}: SurveyRunnerProps) {
  const [stage, setStage] = useState<Stage>(showWelcome ? "welcome" : "questions");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<string>(new Date().toISOString());
  const responseId = useRef<string>(uuid());
  const honeypot = useRef<HTMLInputElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const qs = survey.questions;
  const q = qs[index];
  const isLast = index === qs.length - 1;
  const current = q ? answers[q.id] : undefined;
  const hasValue = current !== undefined && !(typeof current === "string" && current.trim() === "");

  const brandStyle = useMemo(
    () =>
      ({
        "--brand": restaurant.primaryColor,
        "--brand-ink": readableOn(restaurant.primaryColor),
      }) as React.CSSProperties,
    [restaurant.primaryColor],
  );

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  // Mueve el foco a la pregunta al cambiar, para lectores de pantalla y teclado.
  useEffect(() => {
    if (stage === "questions") headingRef.current?.focus();
  }, [index, stage]);

  const start = () => {
    onActivity?.();
    startedAt.current = new Date().toISOString();
    setStage("questions");
  };

  const submit = useCallback(
    async (finalAnswers: Record<string, AnswerValue>) => {
      setStage("submitting");
      setError(null);
      const cleaned: Record<string, AnswerValue> = {};
      for (const [k, v] of Object.entries(finalAnswers)) {
        if (typeof v === "string") {
          if (v.trim()) cleaned[k] = v.trim();
        } else cleaned[k] = v;
      }
      try {
        await onSubmit({
          id: responseId.current,
          surveyId: survey.id,
          answers: cleaned,
          startedAt: startedAt.current,
          submittedAt: new Date().toISOString(),
          website: honeypot.current?.value || undefined,
        });
        setStage("done");
        onDone?.();
      } catch (e) {
        setError((e as Error).message || "No pudimos enviar tu respuesta.");
        setStage("error");
      }
    },
    [onSubmit, onDone, survey.id],
  );

  const next = useCallback(
    (overrideAnswers?: Record<string, AnswerValue>) => {
      const a = overrideAnswers ?? answers;
      if (isLast) void submit(a);
      else setIndex((i) => i + 1);
    },
    [answers, isLast, submit],
  );

  const setValue = (v: AnswerValue) => {
    onActivity?.();
    const updated = { ...answers, [q.id]: v };
    setAnswers(updated);
    // Avance automático en preguntas de un toque (excepto la última, que confirma con "Enviar").
    if (q.type !== "TEXT" && !isLast) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => setIndex((i) => Math.min(i + 1, qs.length - 1)), 320);
    }
  };

  const back = () => {
    onActivity?.();
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (index > 0) setIndex((i) => i - 1);
    else if (showWelcome) setStage("welcome");
  };

  const progress = stage === "done" ? 100 : Math.round((index / Math.max(qs.length, 1)) * 100);

  return (
    <div style={brandStyle} className={cn("@container flex min-h-full flex-col bg-paper text-ink", className)}>
      {/* Honeypot: invisible para personas, los bots lo llenan. */}
      <div aria-hidden inert className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No llenar
          <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <header className="flex items-center gap-3 px-5 pt-5 @2xl:px-8 @2xl:pt-6">
        {restaurant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurant.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain @2xl:h-12 @2xl:w-12" />
        ) : null}
        <p className="font-display text-lg font-semibold @2xl:text-xl">{restaurant.name}</p>
      </header>

      {stage === "questions" || stage === "submitting" ? (
        <div
          className="mx-5 mt-5 h-1.5 overflow-hidden rounded-full bg-line @2xl:mx-8"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avance"
        >
          <div
            className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center @2xl:px-8">
        {stage === "welcome" ? (
          <div className="max-w-2xl">
            <h1 className="font-display text-[clamp(34px,6cqi,64px)] font-semibold leading-[1.05]">¿Cómo estuvo todo hoy?</h1>
            {survey.welcomeText ? (
              <p className="mx-auto mt-5 max-w-lg text-lg text-ink-soft @2xl:text-xl">{survey.welcomeText}</p>
            ) : null}
            <button
              type="button"
              onClick={start}
              className="mt-10 inline-flex h-16 items-center rounded-full bg-[var(--brand)] px-12 font-display text-2xl font-semibold text-[var(--brand-ink)] transition-transform active:scale-95"
            >
              Comenzar
            </button>
          </div>
        ) : null}

        {(stage === "questions" || stage === "submitting") && q ? (
          <div key={q.id} className="flex w-full max-w-3xl flex-col items-center gap-10">
            <div>
              <p className="mb-3 text-[15px] text-ink-soft">
                Pregunta {index + 1} de {qs.length}
                {!q.required ? " (opcional)" : ""}
              </p>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-[clamp(28px,4.4cqi,48px)] font-semibold leading-[1.1] outline-none"
              >
                {q.text}
              </h2>
            </div>
            <QuestionInput question={q} value={current} onChange={setValue} />
          </div>
        ) : null}

        {stage === "done" ? (
          <div className="max-w-2xl" role="status">
            <svg viewBox="0 0 64 64" className="mx-auto mb-6 h-20 w-20" aria-hidden>
              <circle cx="32" cy="32" r="30" fill="var(--brand)" />
              <path
                d="M20 33l8 8 16-17"
                fill="none"
                stroke="var(--brand-ink)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h1 className="font-display text-[clamp(36px,6cqi,64px)] font-semibold leading-[1.05]">{survey.closingText}</h1>
            {/gracias/i.test(survey.closingText) ? null : (
              <p className="mt-4 text-lg text-ink-soft">Gracias por tomarte el tiempo.</p>
            )}
            {doneNote ? <div className="mt-6 text-sm text-ink-faint">{doneNote}</div> : null}
          </div>
        ) : null}

        {stage === "error" ? (
          <div className="max-w-lg" role="alert">
            <h1 className="font-display text-3xl font-semibold">No se envió tu respuesta</h1>
            <p className="mt-3 text-lg text-ink-soft">
              {error && /[.!?]$/.test(error) ? error : `${error}.`} Tus respuestas siguen aquí.
            </p>
            <button
              type="button"
              onClick={() => void submit(answers)}
              className="mt-8 inline-flex h-14 items-center rounded-full bg-[var(--brand)] px-10 font-display text-xl font-semibold text-[var(--brand-ink)]"
            >
              Reintentar
            </button>
          </div>
        ) : null}
      </main>

      {stage === "questions" || stage === "submitting" ? (
        <nav className="flex items-center justify-between gap-3 px-5 pb-6 @2xl:px-8 @2xl:pb-8">
          <button
            type="button"
            onClick={back}
            disabled={(index === 0 && !showWelcome) || stage === "submitting"}
            className="inline-flex h-14 min-w-14 items-center gap-2 rounded-full px-4 text-lg text-ink-soft hover:bg-line-soft disabled:invisible"
          >
            <ArrowLeft size={22} aria-hidden /> Atrás
          </button>
          {isLast || q?.type === "TEXT" || (hasValue && q?.type === "SINGLE_CHOICE") ? (
            <div className="flex items-center gap-3">
              {q?.required && !hasValue ? (
                <span className="hidden text-[15px] text-ink-soft @md:inline">Elige una opción para continuar</span>
              ) : null}
              <button
                type="button"
                onClick={() => next()}
                disabled={(q?.required && !hasValue) || stage === "submitting"}
                className="inline-flex h-14 items-center rounded-full bg-[var(--brand)] px-10 font-display text-xl font-semibold text-[var(--brand-ink)] transition-opacity disabled:opacity-40"
              >
                {stage === "submitting" ? "Enviando…" : isLast ? "Enviar" : hasValue ? "Siguiente" : "Omitir"}
              </button>
            </div>
          ) : !q?.required ? (
            <button
              type="button"
              onClick={() => next()}
              className="inline-flex h-14 items-center rounded-full px-6 text-lg text-ink-soft hover:bg-line-soft"
            >
              Omitir
            </button>
          ) : hasValue ? (
            <button
              type="button"
              onClick={() => next()}
              className="inline-flex h-14 items-center rounded-full px-6 text-lg font-medium text-ink hover:bg-line-soft"
            >
              Siguiente
            </button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      {footer}
    </div>
  );
}
