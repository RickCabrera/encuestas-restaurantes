"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { saveRewardAction, saveSurveyPointsAction, setRewardActiveAction } from "@/app/actions/loyalty";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { type ActionState, initialState } from "@/lib/action-state";

export function SurveyPointsForm({
  branches,
  max,
}: {
  branches: { id: string; name: string; loyaltyPoints: number; active: boolean }[];
  max: number;
}) {
  const [state, action] = useActionState(saveSurveyPointsAction, initialState);
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="green">{state.message}</Notice> : null}
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Sucursal</th>
              <th className="w-48">Puntos por encuesta</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id}>
                <td>
                  <label htmlFor={`points-${b.id}`} className="font-medium">
                    {b.name}
                  </label>
                  {!b.active ? <span className="ml-2 text-[13px] text-ink-faint">(inactivo)</span> : null}
                </td>
                <td>
                  <input
                    id={`points-${b.id}`}
                    name={`points:${b.id}`}
                    type="number"
                    min={0}
                    max={max}
                    step={1}
                    defaultValue={b.loyaltyPoints}
                    className="input w-32 tabular-nums"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <SubmitButton>Guardar puntos</SubmitButton>
      </div>
    </form>
  );
}

type RewardValues = { id: string; name: string; description: string; pointsCost: number; active: boolean };

function RewardForm({ reward, onSaved }: { reward?: RewardValues; onSaved: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await saveRewardAction(reward?.id ?? null, prev, fd);
    if (r.ok) {
      router.refresh();
      onSaved();
    }
    return r;
  }, initialState);
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  return (
    <form action={action} className="space-y-5">
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      <Field label="Nombre" htmlFor="reward-name" error={fe.name}>
        <input
          id="reward-name"
          name="name"
          className="input"
          required
          maxLength={80}
          defaultValue={v?.name ?? reward?.name}
          placeholder="Postre de la casa"
        />
      </Field>
      <Field label="Puntos que cuesta" htmlFor="reward-cost" error={fe.pointsCost}>
        <input
          id="reward-cost"
          name="pointsCost"
          type="number"
          min={1}
          step={1}
          className="input w-40"
          required
          defaultValue={v?.pointsCost ?? reward?.pointsCost}
        />
      </Field>
      <Field
        label="Descripción (opcional)"
        htmlFor="reward-description"
        error={fe.description}
        hint="Condiciones, por ejemplo “No aplica con otras promociones”."
      >
        <input
          id="reward-description"
          name="description"
          className="input"
          maxLength={200}
          defaultValue={v?.description ?? reward?.description}
        />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>{reward ? "Guardar cambios" : "Agregar premio"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddReward() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        Agregar premio
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Agregar premio">
        <RewardForm key={formKey} onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function RewardRowActions({ reward }: { reward: RewardValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        Editar
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setRewardActiveAction(reward.id, !reward.active);
            router.refresh();
          })
        }
      >
        {reward.active ? "Desactivar" : "Activar"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Editar premio">
        <RewardForm key={formKey} reward={reward} onSaved={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
