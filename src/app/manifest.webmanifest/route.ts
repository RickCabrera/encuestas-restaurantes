/**
 * Manifest de la app instalable del modo tablet. Solo lo enlaza /kiosk (ver src/app/kiosk/page.tsx):
 * así el navegador ofrece "Instalar aplicación" únicamente ahí, no en la página de inicio ni en los
 * paneles. En tablets Android se recomienda la app nativa (APK); esto es para iPad o sin APK.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "Sobremesa · Modo tablet",
      short_name: "Sobremesa",
      description: "Encuesta de experiencia para comensales",
      id: "/kiosk",
      start_url: "/kiosk",
      scope: "/kiosk",
      display: "fullscreen",
      orientation: "any",
      background_color: "#f6f4ef",
      theme_color: "#0e8a6e",
      lang: "es-MX",
      icons: [
        { src: "/icons/192", sizes: "192x192", type: "image/png" },
        { src: "/icons/512", sizes: "512x512", type: "image/png" },
        { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
