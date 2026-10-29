"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { createDemoRequestAction } from "@/app/actions/demo-request";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";

export function DemoForm() {
  const [state, action] = useActionState(createDemoRequestAction, {} as ActionState);
  if (state.ok) {
    return (
      <div className="flex flex-col items-start gap-4 py-6" role="status">
        <CheckCircle2 size={44} className="text-basil" aria-hidden />
        <p className="font-display text-2xl font-bold">Solicitud enviada</p>
        <p className="text-ink-soft">{state.message ?? "¡Gracias! Te contactamos muy pronto."}</p>
      </div>
    );
  }
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      {state.error ? (
        <div className="sm:col-span-2">
          <Notice tone="red">{state.error}</Notice>
        </div>
      ) : null}
      {/* Campo trampa para bots: oculto a personas y lectores de pantalla. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Sitio web
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Field label="Tu nombre" htmlFor="d-name" error={fe.name}>
        <input id="d-name" name="name" autoComplete="name" defaultValue={v.name} className="input" required />
      </Field>
      <Field label="Restaurante o cadena" htmlFor="d-business" error={fe.business}>
        <input id="d-business" name="business" autoComplete="organization" defaultValue={v.business} className="input" required />
      </Field>
      <Field label="Correo" htmlFor="d-email" error={fe.email}>
        <input id="d-email" name="email" type="email" autoComplete="email" defaultValue={v.email} className="input" required />
      </Field>
      <Field label="WhatsApp o teléfono" htmlFor="d-phone" error={fe.phone}>
        <input id="d-phone" name="phone" type="tel" autoComplete="tel" defaultValue={v.phone} className="input" />
      </Field>
      <Field label="Ciudad" htmlFor="d-city" error={fe.city}>
        <input id="d-city" name="city" autoComplete="address-level2" defaultValue={v.city} className="input" />
      </Field>
      <Field label="Sucursales" htmlFor="d-branches" error={fe.branches}>
        <select id="d-branches" name="branches" defaultValue={v.branches ?? ""} className="input">
          <option value="">Elige una opción</option>
          <option value="1">1</option>
          <option value="2-5">2 a 5</option>
          <option value="6-10">6 a 10</option>
          <option value="11+">Más de 10</option>
        </select>
      </Field>
      <Field label="¿Algo que debamos saber? (opcional)" htmlFor="d-message" error={fe.message} className="sm:col-span-2">
        <textarea id="d-message" name="message" rows={3} defaultValue={v.message} className="input" />
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <SubmitButton size="lg" className="w-full" pendingText="Enviando…">
          Pedir demo
        </SubmitButton>
        <p className="text-[13px] text-ink-faint">Usamos tus datos solo para contactarte sobre Sobremesa. Nada de spam.</p>
      </div>
    </form>
  );
}
