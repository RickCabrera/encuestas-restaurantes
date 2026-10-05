"use client";

import { useActionState, useState } from "react";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { type ActionState, initialState } from "@/lib/action-state";

type Values = {
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER";
  notifyLowScores: boolean;
  restaurantIds: string[];
};

export function UserForm({
  action,
  values,
  restaurants,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  values?: Values;
  restaurants: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [role, setRole] = useState<Values["role"]>(values?.role ?? "MANAGER");
  const fe = state.fieldErrors ?? {};
  const isNew = !values;

  return (
    <form action={formAction} className="panel max-w-2xl space-y-6 p-6">
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="name" error={fe.name}>
          <input id="name" name="name" className="input" defaultValue={values?.name} required />
        </Field>
        <Field label="Correo" htmlFor="email" error={fe.email}>
          <input id="email" name="email" type="email" className="input" defaultValue={values?.email} required />
        </Field>
      </div>
      <Field
        label={isNew ? "Contraseña inicial" : "Nueva contraseña"}
        htmlFor="password"
        error={fe.password}
        hint={isNew ? "Mínimo 8 caracteres. Compártela por un medio seguro." : "Déjala vacía para no cambiarla."}
      >
        <input id="password" name="password" type="password" autoComplete="new-password" className="input" required={isNew} />
      </Field>

      <fieldset>
        <legend className="label">Rol</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          {(
            [
              ["MANAGER", "Gerente", "Ve resultados de sus restaurantes."],
              ["ADMIN", "Administrador", "Configura todo y ve todos los restaurantes."],
            ] as const
          ).map(([v, label, desc]) => (
            <label key={v} className="flex items-start gap-2 text-sm">
              <input type="radio" name="role" value={v} checked={role === v} onChange={() => setRole(v)} className="mt-1" />
              <span>
                <span className="font-medium">{label}</span>
                <span className="block text-ink-soft">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {role === "MANAGER" ? (
        <fieldset>
          <legend className="label">Restaurantes que puede ver</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {restaurants.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="restaurantIds" value={r.id} defaultChecked={values?.restaurantIds.includes(r.id)} />
                {r.name}
              </label>
            ))}
          </div>
          {fe.restaurantIds ? <p className="field-error">{fe.restaurantIds[0]}</p> : null}
        </fieldset>
      ) : null}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="notifyLowScores" defaultChecked={values?.notifyLowScores} className="mt-1" />
        <span>
          <span className="font-medium">Avisar por correo de calificaciones bajas</span>
          <span className="block text-ink-soft">2 estrellas o menos, o recomendación de 6 o menos.</span>
        </span>
      </label>

      <div className="flex justify-end">
        <SubmitButton>{isNew ? "Crear usuario" : "Guardar cambios"}</SubmitButton>
      </div>
    </form>
  );
}
