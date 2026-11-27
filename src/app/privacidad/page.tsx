import { BackButton } from "./back-button";

export const metadata = { title: "Aviso de privacidad" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="text-3xl font-semibold">Aviso de privacidad</h1>
      <div className="mt-6 space-y-4 text-[16px] leading-relaxed text-ink-soft">
        <p>
          No te pedimos nombre, correo ni ningún otro dato que te identifique. Guardamos tus respuestas, la fecha y hora, y el
          restaurante (y la mesa, si llegaste por un QR de mesa).
        </p>
        <h2 className="pt-2 text-lg font-semibold text-ink">Programa de puntos</h2>
        <p>
          Si el restaurante tiene programa de puntos, al final puedes escribir tu número de celular para acumularlos. Es opcional:
          puedes enviar la encuesta sin él. Si lo escribes, guardamos el número junto con los puntos que ganas y canjeas (fecha,
          sucursal y encuesta que los generó) para llevar tu saldo y que el personal del restaurante pueda entregarte tus premios.
          No lo usamos para enviarte publicidad ni lo compartimos con terceros. En el celular desde el que contestaste, tu
          navegador lo recuerda para la próxima vez.
        </p>
        <p>
          Para ejercer tus derechos sobre tu número (acceso, rectificación, cancelación u oposición), contacta al restaurante.
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
