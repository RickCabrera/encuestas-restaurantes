"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction } from "@/app/actions/auth";
import { updateNotificationsAction } from "@/app/actions/users";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialState } from "@/lib/action-state";

export function AccountForms({ notifyLowScores }: { notifyLowScores: boolean }) {
  const [pw, pwAction] = useActionState(changePasswordAction, initialState);
  const [notif, notifAction] = useActionState(updateNotificationsAction, initialState);
  const pwForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (pw.ok) pwForm.current?.reset();
  }, [pw]);
  const fe = pw.fieldErrors ?? {};

  return (
    <div className="grid max-w-3xl gap-10">
      <section className="grid gap-5 md:grid-cols-[200px_1fr]">
        <h2 className="text-lg font-semibold">Contraseña</h2>
        <form ref={pwForm} action={pwAction} className="panel space-y-5 p-5">
          {pw.ok ? <Notice tone="green">{pw.message}</Notice> : null}
          <Field label="Contraseña actual" htmlFor="current" error={fe.current}>
            <input id="current" name="current" type="password" autoComplete="current-password" className="input" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nueva contraseña" htmlFor="password" error={fe.password} hint="Mínimo 8 caracteres.">
              <input id="password" name="password" type="password" autoComplete="new-password" className="input" />
            </Field>
            <Field label="Confírmala" htmlFor="confirm" error={fe.confirm}>
              <input id="confirm" name="confirm" type="password" autoComplete="new-password" className="input" />
            </Field>
          </div>
          <div className="flex justify-end">
            <SubmitButton>Cambiar contraseña</SubmitButton>
          </div>
        </form>
      </section>

      <section className="grid gap-5 md:grid-cols-[200px_1fr]">
        <h2 className="text-lg font-semibold">Avisos</h2>
        <form action={notifAction} className="panel space-y-5 p-5">
          {notif.ok ? <Notice tone="green">{notif.message}</Notice> : null}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="notifyLowScores" defaultChecked={notifyLowScores} className="mt-1" />
            <span>
              <span className="font-medium">Recibir un correo cuando llegue una calificación baja</span>
              <span className="block text-ink-soft">
                2 estrellas o menos, o recomendación de 6 o menos, en los restaurantes que puedes ver.
              </span>
            </span>
          </label>
          <div className="flex justify-end">
            <SubmitButton>Guardar avisos</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
