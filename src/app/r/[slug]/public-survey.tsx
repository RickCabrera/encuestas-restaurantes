"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SurveyRunner } from "@/components/survey/survey-runner";
import type { RunnerRestaurant, RunnerSurvey, SubmitPayload } from "@/components/survey/types";

const RESUBMIT_WINDOW_MS = 30 * 60 * 1000;

/** Por restaurante (no por encuesta): publicar una versión nueva no reabre la encuesta al mismo comensal. */
function sentKey(restaurantKey: string) {
  return `encuesta:enviada:${restaurantKey}`;
}

function recentlySent(restaurantKey: string) {
  try {
    const t = Number(localStorage.getItem(sentKey(restaurantKey)));
    return Number.isFinite(t) && Date.now() - t < RESUBMIT_WINDOW_MS;
  } catch {
    return false;
  }
}

async function postWithRetry(body: unknown, attempts = 3) {
  let lastError: Error = new Error("No pudimos conectar.");
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      // Errores del cliente no se reintentan.
      if (res.status < 500) throw Object.assign(new Error(data.error ?? "No pudimos guardar tu respuesta."), { final: true });
      lastError = new Error(data.error ?? "El servidor no respondió.");
    } catch (e) {
      if ((e as { final?: boolean }).final) throw e;
      lastError = new Error("Revisa tu conexión a internet.");
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw lastError;
}

export function PublicSurvey({
  survey,
  restaurant,
  tableRef,
  restaurantKey,
}: {
  survey: RunnerSurvey;
  restaurant: RunnerRestaurant;
  tableRef: string | null;
  restaurantKey: string;
}) {
  const [alreadySent, setAlreadySent] = useState(false);
  useEffect(() => {
    // Leer localStorage solo en el cliente; evita desajustes de hidratación.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlreadySent(recentlySent(restaurantKey));
  }, [restaurantKey]);

  const onSubmit = async (p: SubmitPayload) => {
    await postWithRetry({ ...p, tableRef });
    try {
      localStorage.setItem(sentKey(restaurantKey), String(Date.now()));
    } catch {
      /* navegación privada */
    }
  };

  const footer = (
    <footer className="px-5 pb-5 text-center text-[13px] text-ink-faint sm:px-8">
      Encuesta anónima: no pedimos datos personales.{" "}
      <Link href="/privacidad" className="underline underline-offset-2 hover:text-ink-soft">
        Aviso de privacidad
      </Link>
    </footer>
  );

  if (alreadySent) {
    return (
      <main className="flex min-h-dvh flex-col bg-paper">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="font-display text-lg font-semibold text-ink-soft">{restaurant.name}</p>
          <h1 className="mt-4 font-display text-4xl font-semibold">Ya recibimos tu respuesta</h1>
          <p className="mt-3 max-w-md text-lg text-ink-soft">{survey.closingText}</p>
        </div>
        {footer}
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SurveyRunner survey={survey} restaurant={restaurant} onSubmit={onSubmit} className="flex-1" footer={footer} />
    </div>
  );
}
