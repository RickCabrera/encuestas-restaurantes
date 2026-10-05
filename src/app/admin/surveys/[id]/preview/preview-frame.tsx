"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SurveyRunner } from "@/components/survey/survey-runner";
import type { RunnerRestaurant, RunnerSurvey } from "@/components/survey/types";
import { cn } from "@/lib/cn";

const DEVICES = {
  tablet: { label: "Tablet", w: 1024, h: 720 },
  phone: { label: "Celular", w: 390, h: 760 },
} as const;

export function PreviewFrame({ survey, restaurant }: { survey: RunnerSurvey; restaurant: RunnerRestaurant }) {
  const [device, setDevice] = useState<keyof typeof DEVICES>("tablet");
  const [run, setRun] = useState(0);
  const d = DEVICES[device];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-[var(--radius-sm)] border border-line bg-surface p-0.5"
          role="group"
          aria-label="Dispositivo"
        >
          {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={device === k}
              onClick={() => setDevice(k)}
              className={cn(
                "rounded-[5px] px-3 py-1.5 text-sm",
                device === k ? "bg-basil text-white" : "text-ink-soft hover:text-ink",
              )}
            >
              {DEVICES[k].label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRun((r) => r + 1)}>
          <RotateCcw size={14} /> Reiniciar
        </Button>
      </div>
      <div className="overflow-x-auto pb-4">
        <div
          className="relative mx-auto overflow-hidden rounded-[28px] border-[10px] border-ink bg-paper shadow-xl"
          style={{ width: d.w, maxWidth: "100%", height: d.h }}
        >
          <div className="h-full overflow-y-auto">
            <SurveyRunner
              key={`${device}-${run}`}
              survey={survey}
              restaurant={restaurant}
              className="min-h-full"
              onSubmit={() => new Promise((r) => setTimeout(r, 500))}
              doneNote="Vista previa: esta respuesta no se guardó."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
