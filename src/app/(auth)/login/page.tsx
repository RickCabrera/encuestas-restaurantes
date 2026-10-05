import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  if (await getSessionUser()) redirect("/admin");
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-[28px] font-semibold">Iniciar sesión</h1>
      <p className="mt-1 mb-8 text-ink-soft">Entra con el correo que te dio el administrador.</p>
      {sp.reset ? (
        <div className="mb-6">
          <Notice tone="green">Tu contraseña se actualizó. Ya puedes iniciar sesión.</Notice>
        </div>
      ) : null}
      <LoginForm next={sp.next} />
      <p className="mt-6 text-sm">
        <Link href="/forgot-password" className="link">
          Olvidé mi contraseña
        </Link>
      </p>
    </>
  );
}
