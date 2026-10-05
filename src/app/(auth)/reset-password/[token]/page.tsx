"use client";

import { use, useActionState } from "react";
import { resetPasswordAction } from "@/app/actions/auth";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialState } from "@/lib/action-state";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, action] = useActionState(resetPasswordAction, initialState);
  return (
    <>
      <h1 className="text-[28px] font-semibold">Nueva contraseña</h1>
      <p className="mt-1 mb-8 text-ink-soft">Usa al menos 8 caracteres.</p>
      <form action={action} className="space-y-5" noValidate>
        {state.error ? <Notice tone="red">{state.error}</Notice> : null}
        <input type="hidden" name="token" value={token} />
        <Field label="Nueva contraseña" htmlFor="password" error={state.fieldErrors?.password}>
          <input id="password" name="password" type="password" autoComplete="new-password" className="input" autoFocus />
        </Field>
        <Field label="Confírmala" htmlFor="confirm" error={state.fieldErrors?.confirm}>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" className="input" />
        </Field>
        <SubmitButton className="w-full" size="lg">
          Guardar contraseña
        </SubmitButton>
      </form>
    </>
  );
}
