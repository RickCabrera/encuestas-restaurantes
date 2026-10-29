import type { Metadata, Viewport } from "next";
import { KioskApp } from "@/components/kiosk/kiosk-app";

export const metadata: Metadata = {
  title: "Encuesta",
  // Solo aquí: es lo que hace que el navegador ofrezca instalar la app del modo tablet.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Encuesta", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0e8a6e",
};

export default function KioskPage() {
  return (
    <div className="kiosk-root">
      <KioskApp />
    </div>
  );
}
