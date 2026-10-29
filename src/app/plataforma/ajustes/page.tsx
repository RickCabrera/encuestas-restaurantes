import { PageHeader, Section } from "@/components/ui/primitives";
import { getAccent } from "@/lib/settings";
import { AccentPicker } from "./accent-picker";

export const metadata = { title: "Ajustes" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const accent = await getAccent();
  return (
    <>
      <PageHeader title="Ajustes" description="Valen para todos los clientes. Los negocios no pueden cambiarlos." />
      <Section title="Color de la interfaz">
        <div className="panel p-5 sm:p-6">
          <p className="mb-6 max-w-2xl text-[15px] text-ink-soft">
            Es el color de los botones principales, del elemento activo del menú, de los enlaces y de los interruptores: en la
            página de inicio, la entrada, el panel de cada negocio y esta Administración. La encuesta que contesta el comensal (QR
            y tablet) usa el color propio de cada restaurante y no cambia; tampoco los colores de estado (verde, ámbar y rojo).
          </p>
          <AccentPicker current={accent} />
        </div>
      </Section>
    </>
  );
}
