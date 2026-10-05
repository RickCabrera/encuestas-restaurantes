import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Encuesta de experiencia",
    short_name: "Encuesta",
    description: "Encuesta de experiencia para comensales",
    start_url: "/kiosk",
    scope: "/",
    display: "fullscreen",
    orientation: "any",
    background_color: "#f3f5f2",
    theme_color: "#2f6b4f",
    lang: "es-MX",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
