"use client";

import { useActionState } from "react";
import { signupAction } from "@/app/actions/signup";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialState } from "@/lib/action-state";

export function SignupForm({ codigo }: { codigo: string }) {
  const [state, action] = useActionState(signupAction, initialState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      <input type="hidden" name="codigo" value={codigo} />
      <Field label="Nombre" htmlFor="name" error={fe.name}>
        <input
          id="name"
          name="name"
          autoComplete="name"
          required
          className="input"
          autoFocus
          defaultValue={state.values?.name}
          key={`name-${state.values?.name ?? ""}`}
        />
      </Field>
      <Field label="Correo" htmlFor="email" error={fe.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          defaultValue={state.values?.email}
          key={`email-${state.values?.email ?? ""}`}
        />
      </Field>
      <Field label="Contraseña" htmlFor="password" error={fe.password} hint="Mínimo 8 caracteres.">
        <input id="password" name="password" type="password" autoComplete="new-password" required className="input" />
      </Field>
      <Field label="Confirmar contraseña" htmlFor="confirm" error={fe.confirm}>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Creando cuenta…">
        Crear cuenta
      </SubmitButton>
    </form>
  );
}
