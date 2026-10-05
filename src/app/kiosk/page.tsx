import type { Metadata, Viewport } from "next";
import { KioskApp } from "@/components/kiosk/kiosk-app";

export const metadata: Metadata = {
  title: "Encuesta",
  appleWebApp: { capable: true, title: "Encuesta", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2f6b4f",
};

export default function KioskPage() {
  return (
    <div className="kiosk-root">
      <KioskApp />
    </div>
  );
}
