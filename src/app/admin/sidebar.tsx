"use client";

import { BarChart3, ClipboardList, Menu, MessageSquareText, Store, Tablet, UserRound, Users, ListChecks, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

const groups = [
  {
    label: "Resultados",
    items: [
      { href: "/admin", label: "Resumen", icon: BarChart3, exact: true },
      { href: "/admin/responses", label: "Respuestas", icon: ListChecks },
      { href: "/admin/comments", label: "Comentarios", icon: MessageSquareText },
    ],
  },
  {
    label: "Configuración",
    items: [
      { href: "/admin/surveys", label: "Encuestas", icon: ClipboardList },
      { href: "/admin/restaurants", label: "Restaurantes", icon: Store, adminOnly: true },
      { href: "/admin/devices", label: "Tablets", icon: Tablet, adminOnly: true },
      { href: "/admin/users", label: "Usuarios", icon: Users, adminOnly: true },
      { href: "/admin/account", label: "Mi cuenta", icon: UserRound },
    ],
  },
];

export function Sidebar({ isAdmin, organizationName }: { isAdmin: boolean; organizationName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav aria-label="Principal" className="flex flex-col gap-7">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-2 px-3 text-[12px] font-medium text-white/50">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items
              .filter((i) => !("adminOnly" in i && i.adminOnly) || isAdmin)
              .map((item) => {
                const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-[14px] transition-colors",
                        active ? "bg-white/12 text-white" : "text-white/75 hover:bg-white/6 hover:text-white",
                      )}
                    >
                      <Icon size={17} strokeWidth={1.75} aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <div className="flex items-center justify-between bg-basil-dark px-5 py-3 text-white lg:hidden">
        <span className="min-w-0">
          <span className="block font-display text-lg font-semibold">Sobremesa</span>
          <span className="block truncate text-[13px] text-white/60">{organizationName}</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="rounded p-1.5 hover:bg-white/10"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
          <span className="sr-only">Menú</span>
        </button>
      </div>
      {open ? (
        <div id="mobile-nav" className="bg-basil-dark px-3 pb-6 lg:hidden">
          {nav}
        </div>
      ) : null}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-basil-dark px-3 py-6 lg:flex">
        <div className="mb-10 px-3">
          <p className="font-display text-xl font-semibold text-white">Sobremesa</p>
          <p className="mt-1 truncate text-[13px] text-white/60" title={organizationName}>
            {organizationName}
          </p>
        </div>
        {nav}
      </aside>
    </>
  );
}
