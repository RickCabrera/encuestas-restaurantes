import {
  BellRing,
  ChartNoAxesCombined,
  Check,
  ClipboardList,
  Download,
  Palette,
  QrCode,
  Store,
  Tablet,
  WifiOff,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { DemoForm } from "@/components/landing/demo-form";
import { HeroVisual } from "@/components/landing/hero-visual";
import { buttonClass } from "@/components/ui/button";
import { isLocalMode } from "@/lib/app-mode";

export const metadata: Metadata = {
  title: { absolute: "Sobremesa · Encuestas de experiencia para restaurantes" },
  description:
    "Encuestas de satisfacción en las tablets de tu restaurante y por QR en la mesa. Resultados por sucursal el mismo día y alertas de calificaciones bajas.",
  robots: { index: true, follow: true },
};

const STEPS = [
  {
    n: "1",
    title: "Arma tu encuesta",
    text: "Parte de nuestra plantilla para restaurantes o crea la tuya: estrellas, sí/no, recomendación del 0 al 10, opciones y comentarios.",
  },
  {
    n: "2",
    title: "Ponla en cada mesa",
    text: "Vincula las tablets de la sucursal con un código de 6 dígitos e imprime QR por mesa. Funciona aunque se caiga el internet.",
  },
  {
    n: "3",
    title: "Mira qué opinan, hoy",
    text: "Calificaciones de alimentos y atención, NPS y comentarios por restaurante y por día. Si alguien califica bajo, te avisamos.",
  },
];

const FEATURES = [
  {
    icon: Tablet,
    title: "Modo tablet",
    text: "Pantalla completa, se reinicia sola entre comensales y el menú del personal lleva PIN.",
  },
  {
    icon: WifiOff,
    title: "Sin internet, sin problema",
    text: "Las respuestas se guardan en la tablet y se envían solas al volver la conexión.",
  },
  {
    icon: QrCode,
    title: "QR por mesa",
    text: "PDF listo para imprimir con un QR por mesa; sabes de qué mesa vino cada respuesta.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Resultados el mismo día",
    text: "Promedios, tendencia, NPS y distribución por pregunta, filtrados por sucursal y fechas.",
  },
  {
    icon: BellRing,
    title: "Alertas de calificaciones bajas",
    text: "Un correo en cuanto alguien califica con 2 estrellas o menos, para actuar antes de que se vaya.",
  },
  { icon: Store, title: "Varias sucursales", text: "Una cuenta para toda la cadena; los gerentes solo ven sus restaurantes." },
  { icon: Palette, title: "Con tu marca", text: "Tu logo y tu color en la encuesta que ve el comensal." },
  { icon: Download, title: "Tus datos son tuyos", text: "Exporta todas las respuestas a Excel (CSV) cuando quieras." },
];

const INCLUDED = [
  "Encuestas ilimitadas y plantilla para restaurantes",
  "Tablets y QR por mesa en cada sucursal",
  "Respuestas sin límite",
  "Panel de resultados por restaurante",
  "Alertas por correo de calificaciones bajas",
  "Usuarios administradores y gerentes",
  "App para tablets Android e instalación en PC",
  "Acompañamiento para arrancar y soporte por WhatsApp",
];

const FAQ = [
  {
    q: "¿Necesito comprar tablets especiales?",
    a: "No. Funciona en cualquier tablet Android (con nuestra app) o iPad desde el navegador. Si ya tienes tablets en el restaurante, sirven.",
  },
  {
    q: "¿Qué pasa si se va el internet?",
    a: "La tablet sigue mostrando la encuesta y guarda las respuestas. En cuanto vuelve la conexión, las envía solas sin que nadie haga nada.",
  },
  {
    q: "¿Los comensales tienen que dar sus datos?",
    a: "No. La encuesta es anónima y toma menos de un minuto. Así contesta más gente y con más sinceridad.",
  },
  {
    q: "¿Cuánto cuesta?",
    a: "Tenemos un solo plan con todo incluido. El precio depende de cuántas sucursales tengas: pide tu demo y te mandamos la cotización.",
  },
  {
    q: "¿Puedo cambiar las preguntas después?",
    a: "Sí. Puedes publicar una nueva versión cuando quieras; el histórico se conserva y los indicadores siguen siendo comparables.",
  },
];

export default function Home() {
  // La versión instalada en una PC del restaurante no tiene sitio público: va directo al panel.
  if (isLocalMode()) redirect("/admin");

  return (
    <div className="landing-root bg-paper text-ink">
      {/* ───── Hero ───── */}
      <header className="relative isolate overflow-hidden bg-night text-white">
        <span
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(70% 80% at 0% 0%, color-mix(in oklab, var(--color-basil) 55%, transparent) 0%, transparent 62%), radial-gradient(60% 70% at 100% 100%, rgba(232,163,23,.38) 0%, transparent 65%), linear-gradient(180deg, #101216 0%, #15181d 100%)",
          }}
        />
        <nav className="mx-auto flex max-w-[1160px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" aria-label="Sobremesa, inicio">
            <Logo tone="light" size={36} />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href="#funciones"
              className="hidden rounded-lg px-3 py-2 text-[15px] font-medium text-white/85 hover:text-white md:block"
            >
              Funciones
            </a>
            <a
              href="#plan"
              className="hidden rounded-lg px-3 py-2 text-[15px] font-medium text-white/85 hover:text-white md:block"
            >
              El plan
            </a>
            <Link href="/login" className="rounded-lg px-3 py-2 text-[15px] font-medium text-white/85 hover:text-white">
              Iniciar sesión
            </Link>
            <a href="#demo" className={buttonClass("primary", "md", "hidden sm:inline-flex")}>
              Pedir demo
            </a>
          </div>
        </nav>

        <div className="mx-auto grid max-w-[1160px] items-center gap-12 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16 lg:pb-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[13px] text-white/80">
              <span className="h-2 w-2 rounded-full bg-[#e8a317]" /> Encuestas de experiencia para restaurantes
            </p>
            <h1 className="mt-6 font-display text-[42px] leading-[1.02] font-bold tracking-[-0.03em] sm:text-[58px] lg:text-[64px]">
              Lo que tus comensales opinan, el mismo día.
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-white/75">
              Sobremesa pone una encuesta breve en las tablets de cada sucursal y en un QR en la mesa. Tú ves calificaciones,
              recomendación y comentarios por restaurante, y te avisamos al instante cuando algo sale mal.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#demo" className={buttonClass("primary", "lg")}>
                Pedir demo
              </a>
              <a
                href="#como-funciona"
                className="inline-flex h-12 items-center rounded-[var(--radius-sm)] border border-white/25 px-6 text-base font-medium text-white transition-colors hover:border-white/50 hover:bg-white/[0.06]"
              >
                Ver cómo funciona
              </a>
              <a
                href="#plan"
                className="inline-flex h-12 items-center rounded-[var(--radius-sm)] border border-white/25 px-6 text-base font-medium text-white transition-colors hover:border-white/50 hover:bg-white/[0.06]"
              >
                Ver el plan
              </a>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-white/10 pt-6">
              {[
                ["< 1 min", "por encuesta"],
                ["0", "datos del comensal"],
                ["24/7", "aunque no haya internet"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="font-display text-2xl font-bold">{v}</dd>
                  <dd className="text-[13px] text-white/55">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroVisual />
        </div>
      </header>

      {/* ───── Cómo funciona ───── */}
      <section id="como-funciona" className="scroll-mt-6 py-20 sm:py-28">
        <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
          <p className="text-sm font-semibold tracking-wide text-basil uppercase">Cómo funciona</p>
          <h2 className="mt-3 max-w-2xl text-[34px] font-bold tracking-[-0.02em] sm:text-[42px]">
            En una tarde quedas listo en todas tus sucursales.
          </h2>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="relative overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface p-7">
                <span className="font-display text-[64px] leading-none font-bold text-basil/15">{s.n}</span>
                <h3 className="mt-2 text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-ink-soft">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───── Funciones ───── */}
      <section id="funciones" className="scroll-mt-6 bg-surface py-20 sm:py-28">
        <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold tracking-wide text-basil uppercase">Funciones</p>
              <h2 className="mt-3 text-[34px] font-bold tracking-[-0.02em] sm:text-[42px]">
                Hecho para el día a día de un restaurante.
              </h2>
              <p className="mt-4 max-w-lg text-[17px] text-ink-soft">
                Nada de formularios eternos ni reportes que llegan a fin de mes: la encuesta toma un minuto y el resultado está en
                tu celular esa misma noche.
              </p>
            </div>
            <DashboardPreview />
          </div>
          <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-[var(--radius-lg)] border border-line bg-paper p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-basil-tint text-basil-ink">
                  <f.icon size={22} aria-hidden />
                </span>
                <h3 className="mt-4 text-[17px] font-bold">{f.title}</h3>
                <p className="mt-1.5 text-[15px] text-ink-soft">{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───── El plan ───── */}
      <section id="plan" className="scroll-mt-6 py-20 sm:py-28">
        <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
          <div className="relative isolate overflow-hidden rounded-[28px] bg-night p-8 text-white sm:p-12">
            <span
              aria-hidden
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(60% 90% at 100% 0%, color-mix(in oklab, var(--color-basil) 50%, transparent) 0%, transparent 65%), radial-gradient(50% 70% at 0% 100%, rgba(232,163,23,.25) 0%, transparent 70%)",
              }}
            />
            <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold tracking-wide text-white/60 uppercase">El plan</p>
                <h2 className="mt-3 text-[34px] font-bold tracking-[-0.02em] sm:text-[44px]">Un solo plan, todo incluido.</h2>
                <p className="mt-4 max-w-md text-[17px] text-white/75">
                  Sin paquetes ni letras chiquitas. La mensualidad depende de cuántas sucursales tengas; pide tu demo y te
                  mandamos la cotización a la medida.
                </p>
                <a href="#demo" className={buttonClass("primary", "lg", "mt-8")}>
                  Pedir cotización
                </a>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {INCLUDED.map((i) => (
                  <li key={i} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-basil">
                      <Check size={13} strokeWidth={3} aria-hidden />
                    </span>
                    <span className="text-[15px] text-white/90">{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ───── Preguntas ───── */}
      <section className="pb-20 sm:pb-28">
        <div className="mx-auto max-w-[820px] px-5 sm:px-8">
          <h2 className="text-center text-[30px] font-bold tracking-[-0.02em] sm:text-[36px]">Preguntas frecuentes</h2>
          <div className="mt-10 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                  {f.q}
                  <span className="text-2xl leading-none text-ink-faint transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───── Pedir demo ───── */}
      <section id="demo" className="scroll-mt-6 bg-surface py-20 sm:py-28">
        <div className="mx-auto grid max-w-[1160px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold tracking-wide text-basil uppercase">Pedir demo</p>
            <h2 className="mt-3 text-[34px] font-bold tracking-[-0.02em] sm:text-[42px]">
              Te lo enseñamos con tu propio restaurante.
            </h2>
            <p className="mt-4 max-w-md text-[17px] text-ink-soft">
              Déjanos tus datos y te contactamos para una demo de 20 minutos. Armamos tu encuesta con tu logo y te mandamos la
              cotización según tus sucursales.
            </p>
            <ul className="mt-8 space-y-3 text-[15px]">
              {["Sin compromiso", "Te ayudamos a configurar todo", "Puedes usar las tablets que ya tienes"].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-basil-tint text-basil-ink">
                    <Check size={14} strokeWidth={3} aria-hidden />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-6 shadow-[0_30px_60px_-40px_rgba(0,0,0,.35)] sm:p-8">
            <DemoForm />
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-paper">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-ink-soft sm:px-8">
          <Logo size={28} />
          <div className="flex flex-wrap gap-5">
            <Link href="/login" className="hover:text-ink">
              Iniciar sesión
            </Link>
            <Link href="/privacidad" className="hover:text-ink">
              Aviso de privacidad
            </Link>
            <span>© {new Date().getFullYear()} Sobremesa</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Vista previa del panel de resultados (ilustrativa, con datos de ejemplo). */
function DashboardPreview() {
  return (
    <div
      className="relative rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[0_30px_70px_-40px_rgba(0,0,0,.4)]"
      aria-hidden
    >
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardList size={16} className="text-basil" /> Resumen · Últimos 7 días
        </p>
        <span className="rounded-full bg-basil-tint px-2.5 py-1 text-[12px] font-medium text-basil-ink">3 sucursales</span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          ["412", "Respuestas"],
          ["4.7", "Alimentos"],
          ["4.5", "Atención"],
          ["+62", "NPS"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl border border-line bg-surface px-3 py-2.5">
            <p className="font-display text-xl font-bold">{v}</p>
            <p className="text-[11px] text-ink-soft">{l}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-line bg-surface p-4">
        <div className="flex h-28 items-end gap-2">
          {[45, 60, 52, 70, 64, 88, 96].map((h, i) => (
            <span key={i} className="flex-1 rounded-t-md bg-line" style={{ height: `${h}%` }}>
              <span className="block h-full rounded-t-md bg-basil" style={{ opacity: 0.35 + i * 0.1 }} />
            </span>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-ink-faint">
          {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-chile/25 bg-chile-tint px-4 py-3 text-sm">
        <BellRing size={16} className="mt-0.5 shrink-0 text-chile" />
        <p>
          <strong>Calificación baja en Boca del Río</strong> · Mesa 7 · “La comida llegó fría”
        </p>
      </div>
    </div>
  );
}
