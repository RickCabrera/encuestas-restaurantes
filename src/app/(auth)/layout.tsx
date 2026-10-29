import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { isLocalMode } from "@/lib/app-mode";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // En la versión instalada en PC no hay sitio público: el logo no lleva a ningún lado.
  const brand = <Logo tone="light" size={38} />;
  return (
    <main className="grid min-h-dvh bg-paper lg:grid-cols-[1fr_minmax(440px,540px)]">
      <section className="relative isolate hidden overflow-hidden bg-night text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <span
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(80% 70% at 0% 0%, color-mix(in oklab, var(--color-basil) 45%, transparent) 0%, transparent 65%), radial-gradient(70% 60% at 100% 100%, rgba(232,163,23,.28) 0%, transparent 70%)",
          }}
        />
        {isLocalMode() ? brand : <Link href="/">{brand}</Link>}
        <div className="max-w-md">
          <p className="font-display text-[46px] leading-[1.03] font-bold tracking-[-0.02em]">
            Lo que tus comensales dicen, el mismo día.
          </p>
          <p className="mt-5 text-[17px] text-white/75">
            Encuestas en las tablets de cada sucursal y por QR en la mesa, con resultados por restaurante.
          </p>
          <div className="mt-10 grid max-w-sm grid-cols-3 gap-3" aria-hidden>
            {[
              ["4.7", "Alimentos"],
              ["4.5", "Atención"],
              ["+62", "NPS"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur">
                <p className="font-display text-2xl font-bold">{v}</p>
                <p className="text-[12px] text-white/60">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm text-white/50">Panel de administración</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo size={34} />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
