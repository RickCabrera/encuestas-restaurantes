import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/public-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sobremesa · Encuestas de experiencia", template: "%s · Sobremesa" },
  description: "Encuestas de experiencia para restaurantes, en tablets y por QR, con resultados el mismo día.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0e8a6e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <head>
        {/* Color de acento elegido en Administración → Ajustes (ver src/app/theme.css/route.ts). */}
        {/* eslint-disable-next-line @next/next/no-css-tags -- hoja dinámica, no un archivo del build */}
        <link rel="stylesheet" href="/theme.css" precedence="default" />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
