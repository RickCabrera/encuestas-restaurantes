"use client";

/** Si la encuesta no se puede cargar (p. ej. el servidor no responde), mensaje claro para el comensal. */
export default function SurveyError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      <h1 className="font-display text-4xl font-semibold">No pudimos cargar la encuesta</h1>
      <p className="mt-3 max-w-md text-lg text-ink-soft">Intenta de nuevo en un momento. Gracias por tu paciencia.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex h-14 items-center rounded-full bg-basil px-10 font-display text-xl font-semibold text-white"
      >
        Reintentar
      </button>
    </main>
  );
}
