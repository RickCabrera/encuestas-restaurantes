"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";

/** Descripción serializable de un campo (así los formularios se arman desde componentes de servidor). */
export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number" | "date" | "textarea" | "select" | "checkbox" | "tel";
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  autoComplete?: string;
  /** Ancho en la rejilla de dos columnas. */
  wide?: boolean;
};

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

function Fields({ fields, state }: { fields: FieldSpec[]; state: ActionState }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const id = `f-${f.name}`;
        const value = state.values?.[f.name] ?? f.defaultValue ?? "";
        const err = state.fieldErrors?.[f.name];
        const cls = cn(f.wide || f.type === "textarea" || f.type === "checkbox" ? "sm:col-span-2" : "");
        if (f.type === "checkbox") {
          return (
            <label key={f.name} className={cn(cls, "flex items-start gap-2 text-sm")}>
              <input type="checkbox" name={f.name} defaultChecked={f.defaultValue === "on"} className="mt-1 accent-basil" />
              <span>
                <span className="font-medium">{f.label}</span>
                {f.hint ? <span className="block text-ink-soft">{f.hint}</span> : null}
              </span>
            </label>
          );
        }
        return (
          <Field key={f.name} label={f.label} htmlFor={id} hint={f.hint} error={err} className={cls}>
            {f.type === "textarea" ? (
              <textarea id={id} name={f.name} defaultValue={value} placeholder={f.placeholder} rows={3} className="input" />
            ) : f.type === "select" ? (
              <select id={id} name={f.name} defaultValue={value} className="input">
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={f.name}
                type={f.type ?? "text"}
                defaultValue={value}
                placeholder={f.placeholder}
                min={f.min}
                max={f.max}
                autoComplete={f.autoComplete}
                className="input"
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

/** Formulario en la página: muestra el mensaje de éxito o error encima del botón. */
export function SpecForm({
  action,
  fields,
  submitLabel,
  pendingText,
  className,
}: {
  action: Action;
  fields: FieldSpec[];
  submitLabel: string;
  pendingText?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  return (
    <form action={formAction} className={cn("space-y-4", className)} noValidate>
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      <Fields fields={fields} state={state} key={state.ok ? "ok" : "edit"} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText={pendingText}>{submitLabel}</SubmitButton>
        {state.ok && state.message ? (
          <span className="text-sm text-basil-ink" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** Botón que abre un diálogo con un formulario; al guardar bien, cierra el diálogo. */
export function ModalForm({
  action,
  fields,
  title,
  triggerLabel,
  triggerVariant = "secondary",
  triggerSize = "md",
  submitLabel,
  submitVariant = "primary",
  description,
}: {
  action: Action;
  fields: FieldSpec[];
  title: string;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger";
  triggerSize?: "sm" | "md" | "lg";
  submitLabel: string;
  submitVariant?: "primary" | "danger";
  description?: React.ReactNode;
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
        <ModalBody
          key={key}
          action={action}
          fields={fields}
          submitLabel={submitLabel}
          submitVariant={submitVariant}
          description={description}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

function ModalBody({
  action,
  fields,
  submitLabel,
  submitVariant,
  description,
  onDone,
}: {
  action: Action;
  fields: FieldSpec[];
  submitLabel: string;
  submitVariant: "primary" | "danger";
  description?: React.ReactNode;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  useEffect(() => {
    if (state.ok && !state.message) onDone();
  }, [state, onDone]);
  if (state.ok && state.message) {
    return (
      <div className="space-y-5">
        <Notice tone="green">{state.message}</Notice>
        <div className="flex justify-end">
          <Button onClick={onDone}>Listo</Button>
        </div>
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-5" noValidate>
      {description ? <div className="text-sm text-ink-soft">{description}</div> : null}
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      <Fields fields={fields} state={state} />
      <div className="flex justify-end">
        <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
