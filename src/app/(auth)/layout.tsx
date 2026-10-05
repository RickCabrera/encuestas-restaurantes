export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="relative hidden overflow-hidden bg-basil-dark text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <p className="font-display text-xl font-semibold">Sobremesa</p>
        <div className="max-w-md">
          <p className="font-display text-[44px] font-semibold leading-[1.05]">Lo que tus comensales dicen, el mismo día.</p>
          <p className="mt-4 text-white/75">
            Encuestas en las tablets de cada sucursal y por QR, con resultados por restaurante.
          </p>
        </div>
        <p className="text-sm text-white/60">Panel de administración</p>
        <svg
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 h-[420px] w-[420px] text-white/[0.06]"
          viewBox="0 0 100 100"
        >
          <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <p className="mb-10 font-display text-xl font-semibold text-basil-dark lg:hidden">Sobremesa</p>
          {children}
        </div>
      </section>
    </main>
  );
}
