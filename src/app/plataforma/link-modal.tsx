"use client";

import { useActionState, useState } from "react";
import type { LinkState } from "@/app/actions/platform";
import { Button } from "@/components/ui/button";
import { CopyLink } from "@/components/ui/copy-link";
import { Modal } from "@/components/ui/modal";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";

type Action = (prev: LinkState, fd: FormData) => Promise<LinkState>;

/**
 * Genera un enlace de alta de un solo uso. Con `withContact`, pide además el correo de la persona
 * para mandárselo (opcional) y lo liga a una solicitud de demo si viene `requestId`.
 */
export function LinkModal({
  action,
  title,
  triggerLabel,
  triggerVariant = "primary",
  triggerSize = "md",
  description,
  withContact = false,
  defaults,
}: {
  action: Action;
  title: string;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
  triggerSize?: "sm" | "md";
  description: React.ReactNode;
  withContact?: boolean;
  defaults?: { email?: string; contactName?: string; requestId?: string };
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <Body key={key} action={action} description={description} withContact={withContact} defaults={defaults} />
      </Modal>
    </>
  );
}

function Body({
  action,
  description,
  withContact,
  defaults,
}: {
  action: Action;
  description: React.ReactNode;
  withContact: boolean;
  defaults?: { email?: string; contactName?: string; requestId?: string };
}) {
  const [state, formAction] = useActionState(action, {} as LinkState);
  if (state.link) {
    return (
      <div className="space-y-4">
        {state.emailed ? <Notice tone="green">También se lo enviamos por correo.</Notice> : null}
        <p className="text-sm text-ink-soft">
          Copia el enlace y envíalo por WhatsApp o correo. <strong className="text-ink">Solo se muestra esta vez.</strong>
        </p>
        <CopyLink link={state.link} note={`Vence el ${state.expiresLabel}. Sirve para un solo registro.`} />
      </div>
    );
  }
  const fe = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="text-sm text-ink-soft">{description}</div>
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      {withContact ? (
        <>
          <input type="hidden" name="requestId" value={defaults?.requestId ?? ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del contacto (opcional)" htmlFor="l-contact" error={fe.contactName}>
              <input id="l-contact" name="contactName" defaultValue={defaults?.contactName} className="input" />
            </Field>
            <Field label="Correo (opcional)" htmlFor="l-email" error={fe.email}>
              <input id="l-email" name="email" type="email" defaultValue={defaults?.email} className="input" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="send" defaultChecked={!!defaults?.email} className="accent-basil" />
            Enviarle el enlace a ese correo
          </label>
        </>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton pendingText="Generando…">Generar enlace</SubmitButton>
      </div>
    </form>
  );
}
