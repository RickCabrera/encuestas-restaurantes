import { cookies } from "next/headers";
import { requirePlatformAdmin } from "@/lib/auth";
import { demoRequestCounts } from "@/lib/queries/platform";
import { THEME_COOKIE } from "@/lib/ui-theme";
import { PlatformSidebar } from "./sidebar";

export const metadata = { title: { default: "Administración", template: "%s · Administración" } };

/** Administración de la plataforma: solo para el equipo que opera Sobremesa. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  const counts = await demoRequestCounts();
  // Las cuentas nuevas arrancan en tema oscuro, como el resto de la Administración.
  const theme = (await cookies()).get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
  return (
    <div id="panel-root" data-theme={theme} className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[264px_1fr]">
      <PlatformSidebar
        userName={user.name}
        userEmail={user.email}
        newRequests={counts.NEW}
        clientPanel={user.organizationInternal ? null : user.organizationName}
        theme={theme}
      />
      <main className="mx-auto w-full max-w-[1040px] min-w-0 px-5 py-8 lg:px-10 lg:py-12">{children}</main>
    </div>
  );
}
