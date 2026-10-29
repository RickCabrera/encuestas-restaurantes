"use client";

import {
  BarChart3,
  ClipboardList,
  ListChecks,
  MessageSquareText,
  ShieldCheck,
  Store,
  Tablet,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { SidebarFrame, type NavGroup } from "@/components/panel/sidebar-frame";

export function Sidebar({
  isAdmin,
  isPlatformAdmin,
  organizationName,
  userName,
  userEmail,
  version,
  theme,
}: {
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  organizationName: string;
  userName: string;
  userEmail: string;
  version: string | null;
  theme: "light" | "dark";
}) {
  const groups: NavGroup[] = [
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
        ...(isAdmin
          ? [
              { href: "/admin/restaurants", label: "Restaurantes", icon: Store },
              { href: "/admin/devices", label: "Tablets", icon: Tablet },
              { href: "/admin/users", label: "Usuarios", icon: Users },
            ]
          : []),
        { href: "/admin/account", label: "Mi cuenta", icon: UserRound },
      ],
    },
  ];

  return (
    <SidebarFrame
      subtitle={organizationName}
      groups={groups}
      user={{ name: userName, detail: version ? `${userEmail} · versión ${version}` : userEmail }}
      theme={theme}
      themeTarget="panel-root"
      extra={
        isPlatformAdmin ? (
          <Link
            href="/plataforma"
            className="mx-1 flex items-center gap-2 rounded-[10px] border border-dashed border-white/20 px-3 py-2 text-[13px] text-white/75 hover:border-white/40 hover:text-white"
          >
            <ShieldCheck size={16} aria-hidden />
            Ir a la Administración
          </Link>
        ) : null
      }
    />
  );
}
