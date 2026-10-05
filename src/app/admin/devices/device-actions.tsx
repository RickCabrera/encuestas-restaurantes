"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  createDeviceAction,
  deleteDeviceAction,
  generatePairingCodeAction,
  type PairingState,
  revokeDeviceAction,
} from "@/app/actions/devices";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((Date.parse(until) - now) / 1000));
  if (left === 0) return <span className="text-chile">El código venció. Genera uno nuevo.</span>;
  return (
    <span>
      Vence en {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
  );
}

function CodeDisplay({ state }: { state: PairingState }) {
  if (!state.code) return null;
  return (
    <div className="text-center">
      <p className="text-sm text-ink-soft">Código para “{state.deviceName}”</p>
      <p className="my-4 font-display text-6xl font-semibold tracking-[0.2em] tabular-nums" aria-live="polite">
        {state.code.slice(0, 3)} {state.code.slice(3)}
      </p>
      <p className="text-sm text-ink-soft">{state.expiresAt ? <Countdown until={state.expiresAt} /> : null}</p>
      <ol className="mx-auto mt-6 max-w-sm list-decimal space-y-1 pl-5 text-left text-sm text-ink-soft">
        <li>En la tablet, abre el navegador en la dirección /kiosk de este sistema.</li>
        <li>Escribe el código y toca “Vincular”.</li>
        <li>Instálala en la pantalla de inicio para que abra en pantalla completa.</li>
      </ol>
    </div>
  );
}

export function AddDevice({
  restaurants,
  defaultRestaurant,
}: {
  restaurants: { id: string; name: string }[];
  defaultRestaurant: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
        disabled={restaurants.length === 0}
      >
        Agregar tablet
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Agregar tablet">
        <AddDeviceForm key={formKey} restaurants={restaurants} defaultRestaurant={defaultRestaurant} />
      </Modal>
    </>
  );
}

function AddDeviceForm({
  restaurants,
  defaultRestaurant,
}: {
  restaurants: { id: string; name: string }[];
  defaultRestaurant: string | null;
}) {
  const [state, action] = useActionState(createDeviceAction, {} as PairingState);
  if (state.code) return <CodeDisplay state={state} />;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5">
      <Field
        label="Nombre"
        htmlFor="device-name"
        error={fe.name}
        hint="Para reconocerla en la lista, por ejemplo “Tablet entrada”."
      >
        <input id="device-name" name="name" className="input" required maxLength={60} />
      </Field>
      <Field label="Restaurante" htmlFor="device-restaurant" error={fe.restaurantId}>
        <select
          id="device-restaurant"
          name="restaurantId"
          className="input"
          defaultValue={defaultRestaurant ?? restaurants[0]?.id}
        >
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingText="Generando…">Generar código</SubmitButton>
      </div>
    </form>
  );
}

export function DeviceRowActions({ id, name, paired }: { id: string; name: string; paired: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [codeState, setCodeState] = useState<PairingState | null>(null);

  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (paired && !confirm(`Generar un código nuevo desvinculará “${name}” cuando otra tablet lo use. ¿Continuar?`)) return;
          start(async () => {
            setCodeState(await generatePairingCodeAction(id));
            router.refresh();
          });
        }}
      >
        {paired ? "Volver a vincular" : "Obtener código"}
      </Button>
      {paired ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (confirm(`¿Desvincular “${name}”? La tablet volverá a pedir código.`))
              start(async () => {
                await revokeDeviceAction(id);
                router.refresh();
              });
          }}
        >
          Desvincular
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        className="text-chile hover:bg-chile-tint hover:text-chile"
        onClick={() => {
          if (confirm(`¿Eliminar “${name}”? Sus respuestas se conservan.`))
            start(async () => {
              await deleteDeviceAction(id);
              router.refresh();
            });
        }}
      >
        Eliminar
      </Button>
      <Modal open={!!codeState?.code} onClose={() => setCodeState(null)} title="Vincular tablet">
        {codeState ? <CodeDisplay state={codeState} /> : null}
      </Modal>
    </div>
  );
}
