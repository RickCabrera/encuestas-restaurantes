"use client";

import { useActionState, useState } from "react";
import { adjustPointsAction, type LoyaltyActionState, redeemRewardAction } from "@/app/actions/loyalty";
import { Field, Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";

type Branch = { id: string; name: string };

function BranchSelect({
  id,
  restaurants,
  defaultRestaurant,
  error,
}: {
  id: string;
  restaurants: Branch[];
  defaultRestaurant: string | null;
  error?: string[];
}) {
  return (
    <Field label="Sucursal" htmlFor={id} error={error}>
      <select id={id} name="restaurantId" className="input" defaultValue={defaultRestaurant ?? restaurants[0]?.id} required>
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function RedeemForm({
  phone,
  balance,
  rewards,
  restaurants,
  defaultRestaurant,
}: {
  phone: string;
  balance: number;
  rewards: { id: string; name: string; pointsCost: number }[];
  restaurants: Branch[];
  defaultRestaurant: string | null;
}) {
  const [state, action] = useActionState(redeemRewardAction, {} as LoyaltyActionState);
  const affordable = rewards.filter((r) => r.pointsCost <= balance);
  const [rewardId, setRewardId] = useState(affordable[0]?.id ?? "");
  const chosen = rewards.find((r) => r.id === rewardId);
  const fe = state.fieldErrors ?? {};

  return (
    <form
      action={action}
      className="space-y-5"
      onSubmit={(e) => {
        if (chosen && !confirm(`¿Canjear “${chosen.name}” por ${chosen.pointsCost.toLocaleString("es-MX")} puntos?`))
          e.preventDefault();
      }}
    >
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="green">{state.message}</Notice> : null}
      <input type="hidden" name="phone" value={phone} />
      <Field label="Premio" htmlFor="redeem-reward" error={fe.rewardId}>
        <select
          id="redeem-reward"
          name="rewardId"
          className="input"
          value={rewardId}
          onChange={(e) => setRewardId(e.target.value)}
          required
        >
          {affordable.length === 0 ? <option value="">Ningún premio le alcanza todavía</option> : null}
          {rewards.map((r) => (
            <option key={r.id} value={r.id} disabled={r.pointsCost > balance}>
              {r.name} · {r.pointsCost.toLocaleString("es-MX")} pts
              {r.pointsCost > balance ? " (no le alcanza)" : ""}
            </option>
          ))}
        </select>
      </Field>
      <BranchSelect id="redeem-branch" restaurants={restaurants} defaultRestaurant={defaultRestaurant} error={fe.restaurantId} />
      <div className="flex justify-end">
        <SubmitButton pendingText="Canjeando…" disabled={!chosen || chosen.pointsCost > balance}>
          Canjear
        </SubmitButton>
      </div>
    </form>
  );
}

export function AdjustForm({
  phone,
  restaurants,
  defaultRestaurant,
}: {
  phone: string;
  restaurants: Branch[];
  defaultRestaurant: string | null;
}) {
  const [state, action] = useActionState(adjustPointsAction, {} as LoyaltyActionState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5">
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="green">{state.message}</Notice> : null}
      <input type="hidden" name="phone" value={phone} />
      <Field label="Puntos" htmlFor="adjust-points" error={fe.points} hint="Negativo para restar, por ejemplo -50.">
        <input id="adjust-points" name="points" type="number" step={1} className="input w-40" required />
      </Field>
      <Field label="Motivo" htmlFor="adjust-note" error={fe.note}>
        <input id="adjust-note" name="note" className="input" required minLength={3} maxLength={200} />
      </Field>
      <BranchSelect id="adjust-branch" restaurants={restaurants} defaultRestaurant={defaultRestaurant} error={fe.restaurantId} />
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingText="Guardando…">
          Aplicar ajuste
        </SubmitButton>
      </div>
    </form>
  );
}
