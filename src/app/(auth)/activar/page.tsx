import Link from "next/link";
import { notFound } from "next/navigation";
import { retryLicenseAction } from "@/app/actions/license";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { isLocalMode } from "@/lib/app-mode";
import { formatDateTime } from "@/lib/dates";
import { getLicenseState, licenseServerUrl } from "@/lib/license-local";
import { ActivateForm } from "./activar-form";

export const metadata = { title: "Activar Sobremesa" };
export const dynamic = "force-dynamic";

/** Activación de la licencia de la versión instalada en PC. En la nube no existe. */
export default async function ActivatePage() {
  if (!isLocalMode()) notFound();
  const state = await getLicenseState();

  if (state.status === "valid") {
    return (
      <>
        <h1 className="text-[28px] font-semibold">Licencia activa</h1>
        <p className="mt-2 mb-8 text-ink-soft">
          Esta PC está activada para <strong className="text-ink">{state.claims.organizationName}</strong>. Se renueva sola
          mientras tenga internet; vence el {formatDateTime(state.claims.expiresAt)} si no logra conectarse antes.
        </p>
        <ButtonLink href="/admin" size="lg" className="w-full">
          Ir al panel
        </ButtonLink>
      </>
    );
  }

  const blocked =
    state.status === "blocked"
      ? state.reason === "inactive"
        ? "La cuenta de tu negocio está desactivada en Sobremesa. En cuanto la reactiven, esta PC vuelve a funcionar sola (o da clic en «Volver a revisar»)."
        : "Esta PC fue dada de baja de tu cuenta de Sobremesa. Si fue un error, actívala de nuevo con la cuenta del negocio."
      : state.status === "expired"
        ? "Esta PC lleva varios días sin poder conectarse a Sobremesa para renovar su licencia. Revisa el internet y da clic en «Volver a revisar»."
        : null;

  return (
    <>
      <h1 className="text-[28px] font-semibold">Activar Sobremesa</h1>
      <p className="mt-2 mb-6 text-ink-soft">
        Entra con la cuenta de administrador de tu negocio en la web de Sobremesa (la misma que te dimos al contratar). Esta PC
        necesita internet para activarse y para renovarse una vez al día; si se va el internet, sigue funcionando hasta 7 días.
      </p>
      {blocked ? (
        <div className="mb-6 space-y-3">
          <Notice tone={state.status === "expired" ? "amber" : "red"}>{blocked}</Notice>
          {state.status !== "blocked" || state.reason === "inactive" ? (
            <form action={retryLicenseAction}>
              <SubmitButton variant="secondary" pendingText="Revisando…">
                Volver a revisar
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
      {state.status === "blocked" && state.reason === "inactive" ? null : <ActivateForm />}
      <p className="mt-6 text-sm text-ink-soft">
        ¿No tienes cuenta?{" "}
        <Link href={`${licenseServerUrl()}/#demo`} className="link">
          Pide tu demo
        </Link>
      </p>
    </>
  );
}
