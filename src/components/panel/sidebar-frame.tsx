"use client";

import type { LucideIcon } from "lucide-react";
import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

/**
 * Menú lateral oscuro de los paneles (negocio y Administración): marca, navegación y, abajo,
 * quién está dentro, el interruptor de tema y cerrar sesión. En celular se vuelve una barra con menú.
 */
export function SidebarFrame({
  subtitle,
  groups,
  user,
  theme,
  themeTarget,
  extra,
}: {
  subtitle: string;
  groups: NavGroup[];
  user: { name: string; detail: string };
  theme: "light" | "dark";
  themeTarget: string;
  /** Enlaces o avisos debajo del menú (p. ej. "Ir a la Administración"). */
  extra?: React.ReactNode;
}) {
  const pathname = usePathname();
  // El menú de celular se cierra solo al navegar: queda abierto solo para la ruta en que se abrió.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  const nav = (
    <nav aria-label="Principal" className="flex flex-col gap-6">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi}>
          {g.label ? (
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.08em] text-white/40 uppercase">{g.label}</p>
          ) : null}
          <ul className="space-y-1">
            {g.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14.5px] font-medium transition-colors",
                      active
                        ? "bg-basil text-white shadow-[0_6px_20px_-8px_var(--color-basil)]"
                        : "text-white/80 hover:bg-white/[0.07] hover:text-white",
                    )}
                  >
                    <Icon size={18} strokeWidth={1.8} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {extra}
    </nav>
  );

  const footer = (
    <div className="mt-auto border-t border-white/10 pt-5">
      <div className="px-3">
        <p className="truncate text-[14px] font-semibold text-white">{user.name}</p>
        <p className="truncate text-[12.5px] text-white/55" title={user.detail}>
          {user.detail}
        </p>
      </div>
      <div className="mt-3">
        <ThemeToggle initial={theme} targetId={themeTarget} />
      </div>
      <form action={logoutAction} className="mt-2 px-1">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-white/15 px-3 py-2.5 text-[14px] font-medium text-white/90 transition-colors hover:border-white/30 hover:bg-white/[0.06]"
        >
          <LogOut size={16} aria-hidden />
          Cerrar sesión
        </button>
      </form>
    </div>
  );

  const glow = (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background:
          "radial-gradient(120% 60% at 0% 0%, color-mix(in oklab, var(--color-basil) 32%, transparent) 0%, transparent 60%), radial-gradient(90% 50% at 100% 100%, rgba(232,163,23,.14) 0%, transparent 70%)",
      }}
    />
  );

  return (
    <>
      <div className="relative isolate flex items-center justify-between overflow-hidden bg-night px-4 py-3 text-white lg:hidden">
        {glow}
        <Logo tone="light" size={30} subtitle={subtitle} />
        <button
          type="button"
          onClick={() => setOpenAt(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="rounded-lg p-2 hover:bg-white/10"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
          <span className="sr-only">Menú</span>
        </button>
      </div>
      {open ? (
        <div id="mobile-nav" className="flex flex-col gap-6 bg-night px-3 pt-2 pb-6 lg:hidden">
          {nav}
          {footer}
        </div>
      ) : null}
      <aside className="sticky top-0 isolate hidden h-dvh flex-col overflow-y-auto bg-night px-4 py-7 lg:flex">
        {glow}
        <div className="mb-9 px-2">
          <Logo tone="light" size={38} subtitle={subtitle} />
        </div>
        {nav}
        <div className="h-6 shrink-0" />
        {footer}
      </aside>
    </>
  );
}
