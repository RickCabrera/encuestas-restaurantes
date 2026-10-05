"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/actions/auth";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialState } from "@/lib/action-state";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(forgotPasswordAction, initialState);
  return (
    <>
      <h1 className="text-[28px] font-semibold">Recuperar contraseña</h1>
      <p className="mt-1 mb-8 text-ink-soft">Te enviaremos un enlace para crear una nueva.</p>
      {state.ok ? (
        <Notice tone="green">{state.message}</Notice>
      ) : (
        <form action={action} className="space-y-5" noValidate>
          <Field label="Correo" htmlFor="email" error={state.fieldErrors?.email}>
            <input id="email" name="email" type="email" autoComplete="email" required className="input" autoFocus />
          </Field>
          <SubmitButton className="w-full" size="lg" pendingText="Enviando…">
            Enviar enlace
          </SubmitButton>
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link href="/login" className="link">
          Volver a iniciar sesión
        </Link>
      </p>
    </>
  );
}
