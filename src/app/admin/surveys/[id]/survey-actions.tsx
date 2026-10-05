"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveSurveyAction, deleteSurveyAction, duplicateSurveyAction, publishSurveyAction } from "@/app/actions/surveys";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/primitives";
import type { ActionState } from "@/lib/action-state";

export function SurveyActions({
  surveyId,
  status,
  restaurantId,
  restaurants,
  canDelete,
}: {
  surveyId: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  restaurantId: string;
  restaurants: { id: string; name: string }[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [targets, setTargets] = useState<string[]>([restaurantId]);

  const run = (fn: () => Promise<ActionState & { newId?: string }>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok && "newId" in r && r.newId) {
        router.push(`/admin/surveys/${r.newId}`);
        return;
      }
      // Varios borradores: se muestran juntos en el listado de encuestas.
      if (r.ok && r.message?.startsWith("Se crearon")) {
        router.push("/admin/surveys?restaurant=all&duplicated=1");
        return;
      }
      router.refresh();
    });

  return (
    <>
      {status !== "ACTIVE" ? (
        <Button
          disabled={pending}
          onClick={() => {
            if (
              confirm(
                "¿Publicar esta encuesta?\n\nSi el restaurante ya tiene una encuesta activa, esa se archivará y esta tomará su lugar en tablets y QR.",
              )
            )
              run(() => publishSurveyAction(surveyId));
          }}
        >
          Publicar
        </Button>
      ) : (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (confirm("¿Archivar esta encuesta?\n\nEl restaurante se quedará sin encuesta activa hasta que publiques otra.")) {
              run(() => archiveSurveyAction(surveyId));
            }
          }}
        >
          Archivar
        </Button>
      )}
      <Button variant="secondary" disabled={pending} onClick={() => setDupOpen(true)}>
        Duplicar
      </Button>
      {canDelete ? (
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (confirm("¿Eliminar este borrador? No se puede deshacer.")) run(() => deleteSurveyAction(surveyId));
          }}
        >
          Eliminar
        </Button>
      ) : null}

      {result?.error || result?.message ? (
        <div className="basis-full">
          <Notice tone={result.error ? "red" : "green"}>{result.error ?? result.message}</Notice>
        </div>
      ) : null}

      <Modal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        title="Duplicar encuesta"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDupOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={pending || targets.length === 0}
              onClick={() => {
                setDupOpen(false);
                run(() => duplicateSurveyAction(surveyId, targets));
              }}
            >
              Crear {targets.length > 1 ? `${targets.length} borradores` : "borrador"}
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-ink-soft">
          Se crea una copia como borrador en cada restaurante que elijas. Para publicar una nueva versión en este mismo
          restaurante, deja solo este marcado.
        </p>
        <div className="space-y-2">
          {restaurants.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={targets.includes(r.id)}
                onChange={(e) => setTargets((t) => (e.target.checked ? [...t, r.id] : t.filter((x) => x !== r.id)))}
              />
              {r.name}
              {r.id === restaurantId ? <span className="text-ink-faint">(este restaurante)</span> : null}
            </label>
          ))}
        </div>
      </Modal>
    </>
  );
}
