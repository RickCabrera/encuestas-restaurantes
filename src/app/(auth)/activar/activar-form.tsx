"use client";

import { useActionState } from "react";
import { activateLicenseAction } from "@/app/actions/license";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";

export function ActivateForm() {
  const [state, action] = useActionState(activateLicenseAction, {} as ActionState);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      <Field label="Correo de tu cuenta de Sobremesa" htmlFor="email" error={state.fieldErrors?.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          key={state.values?.email ?? ""}
          className="input"
          autoFocus
        />
      </Field>
      <Field label="Contraseña" htmlFor="password" error={state.fieldErrors?.password}>
        <input id="password" name="password" type="password" autoComplete="current-password" className="input" />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Activando…">
        Activar esta PC
      </SubmitButton>
    </form>
  );
}
