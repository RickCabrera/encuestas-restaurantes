import { Star } from "lucide-react";

/**
 * Ilustración animada del hero: una tablet con la encuesta (las estrellas se llenan solas),
 * una notificación de respuesta nueva y una tarjeta de resultados. Solo CSS: sin JavaScript.
 */
export function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-[5/4.4] w-full max-w-[560px]" aria-hidden>
      {/* Tablet */}
      <div className="sm-float absolute top-[6%] left-[4%] w-[74%] rounded-[28px] border border-white/15 bg-[#0b0c0f] p-3 shadow-[0_40px_80px_-30px_rgba(0,0,0,.8)]">
        <div className="rounded-[20px] bg-gradient-to-b from-[#1d2027] to-[#14161b] px-6 pt-6 pb-7">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[12px] text-white/60">
              <span className="h-6 w-6 rounded-full bg-basil" /> Casa Jarocha · Centro
            </span>
            <span className="text-[11px] text-white/40">2 de 5</span>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="sm-progress h-full rounded-full bg-basil" />
          </div>
          <p className="mt-7 text-center font-display text-[22px] leading-tight font-semibold text-white sm:text-[26px]">
            ¿Cómo calificas los alimentos?
          </p>
          <div className="mt-6 flex justify-center gap-2 sm:gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star
                key={i}
                className="sm-star h-9 w-9 sm:h-11 sm:w-11"
                fill="currentColor"
                strokeWidth={0}
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <span className="rounded-2xl border border-white/10 py-3 text-center text-sm text-white/50">Anterior</span>
            <span className="rounded-2xl bg-basil py-3 text-center text-sm font-semibold text-white">Siguiente</span>
          </div>
        </div>
      </div>

      {/* Notificación */}
      <div className="sm-pop absolute top-0 right-0 w-[52%] rounded-2xl border border-white/15 bg-white/[0.08] p-3.5 text-white shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="sm-pulse flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-basil text-[13px] font-bold">
            5★
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Nueva respuesta · Mesa 4</p>
            <p className="truncate text-[12px] text-white/60">“El pescado a la veracruzana, increíble”</p>
          </div>
        </div>
      </div>

      {/* Resultados */}
      <div className="sm-float-slow absolute right-0 bottom-0 w-[50%] rounded-2xl border border-white/15 bg-[#14161b]/90 p-4 text-white shadow-2xl backdrop-blur-md [animation-delay:-3s]">
        <p className="text-[12px] text-white/55">Esta semana</p>
        <div className="mt-1 flex items-end gap-4">
          <div>
            <p className="font-display text-[26px] leading-none font-bold">4.7</p>
            <p className="mt-1 text-[11px] text-white/55">Alimentos</p>
          </div>
          <div>
            <p className="font-display text-[26px] leading-none font-bold text-[#e8a317]">+62</p>
            <p className="mt-1 text-[11px] text-white/55">NPS</p>
          </div>
        </div>
        <div className="mt-4 flex h-14 items-end gap-1.5">
          {[38, 52, 44, 66, 58, 80, 92].map((h, i) => (
            <span
              key={i}
              className="sm-bar flex-1 rounded-t-[4px] bg-basil"
              style={{ height: `${h}%`, opacity: 0.45 + i * 0.08, animationDelay: `${0.3 + i * 0.08}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
