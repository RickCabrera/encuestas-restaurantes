import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

/** 404 dentro del panel (incluye recursos de restaurantes a los que el usuario no tiene acceso). */
export default function AdminNotFound() {
  return (
    <div className="panel max-w-xl p-6">
      <h1 className="text-xl font-semibold">No encontramos lo que buscas</h1>
      <p className="mt-2 text-ink-soft">No existe o no tienes acceso a este restaurante. Revisa el enlace o vuelve al resumen.</p>
      <Link href="/admin" className={buttonClass("primary", "md", "mt-5")}>
        Ir al resumen
      </Link>
    </div>
  );
}
