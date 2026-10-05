"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { createInviteAction, type InviteState } from "@/app/actions/invites";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type Restaurant = { id: string; name: string };

/** Genera un enlace de registro de un solo uso para que la persona cree su propia cuenta. */
export function InviteWithLink({ restaurants }: { restaurants: Restaurant[] }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        Invitar con enlace
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Invitar con enlace">
        <InviteForm key={formKey} restaurants={restaurants} />
      </Modal>
    </>
  );
}

function InviteForm({ restaurants }: { restaurants: Restaurant[] }) {
  const [state, action, pending] = useActionState(createInviteAction, {} as InviteState);
  const [role, setRole] = useState<"ADMIN" | "MANAGER">("ADMIN");
  if (state.link) return <LinkDisplay link={state.link} expiresLabel={state.expiresLabel ?? ""} />;
  const fe = state.fieldErrors ?? {};
  return (
    <form
      className="space-y-5"
      // Se envía a mano: con `action`, React reinicia el formulario tras un error y el rol
      // marcado dejaría de coincidir con los restaurantes que se muestran.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <p className="text-sm text-ink-soft">
        La persona que abra el enlace elige su nombre, correo y contraseña. Sirve para un solo registro y vence en 7 días.
      </p>
      <fieldset>
        <legend className="label">Rol</legend>
        <div className="flex flex-col gap-2">
          {(
            [
              ["ADMIN", "Administrador", "Configura todo y ve todos los restaurantes."],
              ["MANAGER", "Gerente", "Ve resultados de sus restaurantes."],
            ] as const
          ).map(([v, label, desc]) => (
            <label key={v} className="flex items-start gap-2 text-sm">
              <input type="radio" name="role" value={v} checked={role === v} onChange={() => setRole(v)} className="mt-1" />
              <span>
                <span className="font-medium">{label}</span>
                <span className="block text-ink-soft">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {role === "MANAGER" ? (
        <fieldset>
          <legend className="label">Restaurantes que podrá ver</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {restaurants.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="restaurantIds" value={r.id} />
                {r.name}
              </label>
            ))}
          </div>
          {fe.restaurantIds ? <p className="field-error">{fe.restaurantIds[0]}</p> : null}
        </fieldset>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Generando…" : "Generar enlace"}
        </Button>
      </div>
    </form>
  );
}

function LinkDisplay({ link, expiresLabel }: { link: string; expiresLabel: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    input.current?.select();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles: el enlace queda seleccionado para copiarlo a mano.
      setCopied(false);
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Copia el enlace y envíalo por un medio seguro. <strong className="text-ink">Solo se muestra esta vez.</strong>
      </p>
      <div className="flex gap-2">
        <input
          ref={input}
          readOnly
          value={link}
          aria-label="Enlace de registro"
          className="input min-w-0 flex-1 font-mono text-[13px]"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button onClick={copy}>{copied ? "Copiado" : "Copiar"}</Button>
      </div>
      <p className="text-sm text-ink-soft" aria-live="polite">
        Vence el {expiresLabel}. Sirve para un solo registro.
      </p>
    </div>
  );
}
