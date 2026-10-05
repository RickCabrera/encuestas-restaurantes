import { BackButton } from "./back-button";

export const metadata = { title: "Aviso de privacidad" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="text-3xl font-semibold">Aviso de privacidad</h1>
      <div className="mt-6 space-y-4 text-[16px] leading-relaxed text-ink-soft">
        <p>
          Esta encuesta es anónima. No te pedimos nombre, correo, teléfono ni ningún otro dato que te identifique. Solo guardamos
          tus respuestas, la fecha y hora, y el restaurante (y la mesa, si llegaste por un QR de mesa).
        </p>
        <p>
          Usamos las respuestas únicamente para conocer tu experiencia y mejorar el servicio. No las vendemos ni las compartimos
          con terceros.
        </p>
        <p>
          Para evitar envíos repetidos, tu navegador recuerda por 30 minutos que ya respondiste, y nuestro servidor registra de
          forma temporal la dirección IP para limitar abusos. Esa información no se asocia con tus respuestas.
        </p>
        <p>Si escribes un comentario, evita incluir datos personales.</p>
      </div>
      <p className="mt-10 text-sm">
        <BackButton />
      </p>
    </main>
  );
}
