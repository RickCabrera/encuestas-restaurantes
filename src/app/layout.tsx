import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/public-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Encuestas de experiencia", template: "%s · Encuestas" },
  description: "Encuestas de experiencia para restaurantes",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2f6b4f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
