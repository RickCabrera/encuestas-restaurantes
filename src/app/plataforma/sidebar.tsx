"use client";

import { Building2, CreditCard, Inbox, Palette, PlugZap, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import { SidebarFrame } from "@/components/panel/sidebar-frame";

export function PlatformSidebar({
  userName,
  userEmail,
  newRequests,
  clientPanel,
  theme,
}: {
  userName: string;
  userEmail: string;
  newRequests: number;
  /** Si la cuenta también es de un negocio, enlace a su panel. */
  clientPanel: string | null;
  theme: "light" | "dark";
}) {
  return (
    <SidebarFrame
      subtitle="Administración"
      theme={theme}
      themeTarget="panel-root"
      user={{ name: userName, detail: `Sobremesa · ${userEmail}` }}
      groups={[
        {
          items: [
            { href: "/plataforma/clientes", label: "Clientes", icon: Building2 },
            {
              href: "/plataforma/solicitudes",
              label: newRequests > 0 ? `Solicitudes (${newRequests})` : "Solicitudes",
              icon: Inbox,
            },
            { href: "/plataforma/pagos", label: "Pagos", icon: CreditCard },
            { href: "/plataforma/conexiones", label: "Conexiones", icon: PlugZap },
            { href: "/plataforma/ajustes", label: "Ajustes", icon: Palette },
            { href: "/plataforma/administradores", label: "Administradores", icon: ShieldCheck },
          ],
        },
      ]}
      extra={
        clientPanel ? (
          <Link
            href="/admin"
            className="mx-1 flex items-center gap-2 rounded-[10px] border border-dashed border-white/20 px-3 py-2 text-[13px] text-white/75 hover:border-white/40 hover:text-white"
          >
            <Store size={16} aria-hidden />
            Panel de {clientPanel}
          </Link>
        ) : null
      }
    />
  );
}
