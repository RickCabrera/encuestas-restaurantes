"use client";

import { useActionState, useState } from "react";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { type ActionState, initialState } from "@/lib/action-state";
import { slugify } from "@/lib/slug";

type Values = {
  id?: string;
  name: string;
  slug: string;
  address: string | null;
  primaryColor: string;
  kioskResetSeconds: number;
  kioskIdleSeconds: number;
  hasLogo: boolean;
  logoUrl?: string;
};

export function RestaurantForm({
  action,
  values,
  appUrl,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  values?: Values;
  appUrl: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const isNew = !values?.id;
  const [name, setName] = useState(values?.name ?? "");
  const [slug, setSlug] = useState(values?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const effectiveSlug = slugTouched ? slug : slugify(name);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-10">
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="green">{state.message}</Notice> : null}

      <fieldset className="grid gap-5 md:grid-cols-[220px_1fr]">
        <legend className="sr-only">Datos generales</legend>
        <div>
          <h2 className="text-lg font-semibold">Datos generales</h2>
          <p className="mt-1 text-sm text-ink-soft">Así aparece el restaurante en la encuesta y en los reportes.</p>
        </div>
        <div className="panel space-y-5 p-5">
          <Field label="Nombre" htmlFor="name" error={fe.name}>
            <input
              id="name"
              name="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </Field>
          <Field
            label="Dirección de la encuesta"
            htmlFor="slug"
            error={fe.slug}
            hint={
              <>
                La encuesta queda en{" "}
                <span className="font-medium text-ink">
                  {appUrl}/r/{effectiveSlug || "…"}
                </span>
              </>
            }
          >
            <input
              id="slug"
              name="slug"
              className="input"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              maxLength={60}
            />
          </Field>
          <Field label="Domicilio (opcional)" htmlFor="address" error={fe.address}>
            <input id="address" name="address" className="input" defaultValue={values?.address ?? ""} maxLength={200} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-5 md:grid-cols-[220px_1fr]">
        <legend className="sr-only">Imagen</legend>
        <div>
          <h2 className="text-lg font-semibold">Imagen</h2>
          <p className="mt-1 text-sm text-ink-soft">Logo y color que ve el comensal en la tablet y en el QR.</p>
        </div>
        <div className="panel space-y-5 p-5">
          <Field
            label="Logo"
            htmlFor="logo"
            error={fe.logo}
            hint="PNG, JPG o WebP de hasta 512 KB. Mejor con fondo transparente."
          >
            <div className="flex items-center gap-4">
              {values?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={values.logoUrl}
                  alt=""
                  className="h-14 w-14 rounded-[var(--radius-sm)] border border-line object-contain p-1"
                />
              ) : null}
              <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" />
            </div>
          </Field>
          {values?.hasLogo ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="removeLogo" /> Quitar el logo actual
            </label>
          ) : null}
          <Field
            label="Color principal"
            htmlFor="primaryColor"
            error={fe.primaryColor}
            hint="Se usa en botones y en la barra de progreso."
          >
            <input
              id="primaryColor"
              name="primaryColor"
              type="color"
              defaultValue={values?.primaryColor ?? "#2F6B4F"}
              className="h-10 w-20 cursor-pointer rounded border border-line bg-surface p-1"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-5 md:grid-cols-[220px_1fr]">
        <legend className="sr-only">Tablets</legend>
        <div>
          <h2 className="text-lg font-semibold">Tablets</h2>
          <p className="mt-1 text-sm text-ink-soft">Cómo se comporta la encuesta en las tablets de este restaurante.</p>
        </div>
        <div className="panel grid gap-5 p-5 sm:grid-cols-2">
          <Field
            label="PIN del menú del personal (tablets)"
            htmlFor="kioskPin"
            error={fe.kioskPin}
            hint={isNew ? "De 4 a 6 dígitos. Lo usa el personal." : "Déjalo vacío para conservar el actual."}
            className="sm:col-span-2"
          >
            <input
              id="kioskPin"
              name="kioskPin"
              className="input max-w-[200px] tracking-[0.3em]"
              inputMode="numeric"
              pattern="\d{4,6}"
              maxLength={6}
              autoComplete="off"
              required={isNew}
            />
          </Field>
          <Field
            label="Mostrar el cierre durante"
            htmlFor="kioskResetSeconds"
            error={fe.kioskResetSeconds}
            hint="Segundos antes de volver al inicio."
          >
            <input
              id="kioskResetSeconds"
              name="kioskResetSeconds"
              type="number"
              min={3}
              max={60}
              className="input"
              defaultValue={values?.kioskResetSeconds ?? 8}
            />
          </Field>
          <Field
            label="Reiniciar si nadie responde en"
            htmlFor="kioskIdleSeconds"
            error={fe.kioskIdleSeconds}
            hint="Segundos sin tocar la pantalla para descartar una encuesta a medias."
          >
            <input
              id="kioskIdleSeconds"
              name="kioskIdleSeconds"
              type="number"
              min={15}
              max={600}
              className="input"
              defaultValue={values?.kioskIdleSeconds ?? 60}
            />
          </Field>
        </div>
      </fieldset>

      <div className="flex justify-end">
        <SubmitButton size="lg">{isNew ? "Crear restaurante" : "Guardar cambios"}</SubmitButton>
      </div>
    </form>
  );
}
