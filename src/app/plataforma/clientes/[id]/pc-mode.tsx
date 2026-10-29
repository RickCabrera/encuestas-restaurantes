import { Cloud, HardDrive, RefreshCcw } from "lucide-react";
import { setPcModeAction } from "@/app/actions/platform";
import type { PcMode } from "@/db/schema";
import { cn } from "@/lib/cn";

const MODES: { id: PcMode; title: string; badge?: string; text: string; icon: typeof Cloud }[] = [
  {
    id: "CLOUD",
    title: "Nube",
    badge: "Recomendado",
    icon: Cloud,
    text: "Una sola base: la de la web. El .exe abre la web con su cuenta y ve lo mismo en todos lados. Sus tablets usan la dirección de la nube.",
  },
  {
    id: "LOCAL",
    title: "Solo en su PC",
    icon: HardDrive,
    text: "Sus datos viven solo en su PC (con licencia). Funciona sin internet hasta 7 días. En la web no ve nada.",
  },
  {
    id: "SYNC",
    title: "PC sincronizada",
    icon: RefreshCcw,
    text: "Trabaja en su PC aunque no haya internet y se sincroniza con la nube en los dos sentidos cada minuto. Ve lo mismo en la web y en la PC.",
  },
];

/** Selector del modo de la PC de un cliente (Administración → ficha del cliente). */
export function PcModePicker({ orgId, mode }: { orgId: string; mode: PcMode }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {MODES.map((m) => {
        const active = m.id === mode;
        const Icon = m.icon;
        return (
          <form key={m.id} action={setPcModeAction.bind(null, orgId, m.id)}>
            <button
              type="submit"
              disabled={active}
              aria-pressed={active}
              className={cn(
                "panel flex h-full w-full flex-col items-start gap-2 p-4 text-left transition-colors disabled:cursor-default",
                active ? "border-basil ring-2 ring-basil/30" : "hover:border-ink-faint",
              )}
            >
              <span className="flex w-full items-center gap-2">
                <Icon size={18} className={active ? "text-basil" : "text-ink-soft"} aria-hidden />
                <span className="font-semibold">{m.title}</span>
                {m.badge ? (
                  <span className="rounded-full bg-basil-tint px-2 py-0.5 text-[11px] font-medium text-basil-ink">{m.badge}</span>
                ) : null}
                {active ? <span className="ml-auto text-[12px] font-medium text-basil-ink">Activo</span> : null}
              </span>
              <span className="text-sm text-ink-soft">{m.text}</span>
            </button>
          </form>
        );
      })}
    </div>
  );
}
