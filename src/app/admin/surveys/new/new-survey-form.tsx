"use client";

import { useActionState } from "react";
import { createSurveyAction } from "@/app/actions/surveys";
import { Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialState } from "@/lib/action-state";
import { BASE_TEMPLATE } from "@/lib/survey-template";

export function NewSurveyForm({
  restaurants,
  defaultRestaurant,
}: {
  restaurants: { id: string; name: string }[];
  defaultRestaurant?: string;
}) {
  const [state, action] = useActionState(createSurveyAction, initialState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="panel max-w-2xl space-y-6 p-6">
      <Field label="Restaurante" htmlFor="restaurantId" error={fe.restaurantId}>
        <select id="restaurantId" name="restaurantId" className="input" defaultValue={defaultRestaurant ?? restaurants[0]?.id}>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Título" htmlFor="title" error={fe.title} hint="Solo lo ves tú en el panel.">
        <input id="title" name="title" className="input" defaultValue="Experiencia en restaurante" required />
      </Field>
      <fieldset>
        <legend className="label">Empezar con</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer gap-3 rounded-[var(--radius-sm)] border border-line p-4 has-[:checked]:border-basil has-[:checked]:bg-basil-tint/50">
            <input type="radio" name="template" value="base" defaultChecked className="mt-1" />
            <span>
              <span className="font-medium">Plantilla base</span>
              <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-[13px] text-ink-soft">
                {BASE_TEMPLATE.map((q) => (
                  <li key={q.text}>{q.text}</li>
                ))}
              </ol>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-[var(--radius-sm)] border border-line p-4 has-[:checked]:border-basil has-[:checked]:bg-basil-tint/50">
            <input type="radio" name="template" value="blank" className="mt-1" />
            <span>
              <span className="font-medium">En blanco</span>
              <span className="mt-2 block text-[13px] text-ink-soft">Una sola pregunta para empezar a armarla.</span>
            </span>
          </label>
        </div>
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton pendingText="Creando…">Crear borrador</SubmitButton>
      </div>
    </form>
  );
}
