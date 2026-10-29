import Link from "next/link";
import { Notice } from "@/components/ui/primitives";
import { isLocalMode } from "@/lib/app-mode";
import { orgAllowed } from "@/lib/license-local";
import { findUsableInvite, INVITE_INVALID_MESSAGE } from "@/lib/invites";
import { SignupForm } from "./signup-form";

export const metadata = {
  title: "Crear cuenta",
  // El código va en la URL: que no salga en el Referer ni en buscadores.
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};

/** Registro con enlace de invitación de un solo uso. Sin un código vigente no hay formulario. */
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ codigo?: string | string[] }> }) {
  const { codigo } = await searchParams;
  const token = typeof codigo === "string" ? codigo : null;
  let invite = await findUsableInvite(token);
  // En la PC no se dan de alta cadenas (vienen de la nube) y solo se invita a cadenas con licencia.
  if (invite && isLocalMode() && (!invite.organizationId || !(await orgAllowed(invite.organizationId)))) invite = null;

  if (!invite || !token) {
    return (
      <>
        <h1 className="text-[28px] font-semibold">Enlace no válido</h1>
        <div className="mt-6">
          <Notice tone="red">{INVITE_INVALID_MESSAGE}</Notice>
        </div>
        <p className="mt-6 text-sm">
          <Link href="/login" className="link">
            Ya tengo cuenta: iniciar sesión
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[28px] font-semibold">Crea tu cuenta</h1>
      <p className="mt-1 mb-8 text-ink-soft">
        {invite.kind === "NEW_ORG"
          ? "Da de alta tu cadena o negocio. Serás su administrador."
          : invite.role === "ADMIN"
            ? "Con ella entrarás al panel como administrador."
            : "Con ella entrarás al panel para ver los resultados de tus restaurantes."}
      </p>
      <SignupForm codigo={token} newOrg={invite.kind === "NEW_ORG"} />
    </>
  );
}
