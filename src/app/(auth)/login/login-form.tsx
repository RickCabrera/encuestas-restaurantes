"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialState } from "@/lib/action-state";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Correo" htmlFor="email" error={state.fieldErrors?.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          autoFocus={!state.values?.email}
          defaultValue={state.values?.email}
          key={state.values?.email ?? ""}
        />
      </Field>
      <Field label="Contraseña" htmlFor="password" error={state.fieldErrors?.password}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          autoFocus={!!state.values?.email}
          key={`pw-${state.error ?? ""}-${state.values?.email ?? ""}`}
        />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Entrando…">
        Entrar
      </SubmitButton>
    </form>
  );
}
