import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/$", disallow: ["/admin", "/plataforma", "/r/", "/kiosk", "/registro", "/api/"] }],
    ...(base ? { host: base } : {}),
  };
}
