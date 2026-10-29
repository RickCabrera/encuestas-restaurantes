import { redirect } from "next/navigation";

/** Antes la PC se activaba aquí; ahora se activa al iniciar sesión con la cuenta de la nube. */
export default function ActivatePage() {
  redirect("/login");
}
