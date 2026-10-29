import { getAccent } from "@/lib/settings";
import { accentCss } from "@/lib/ui-theme";

export const dynamic = "force-dynamic";

/**
 * Color de acento elegido en Administración → Ajustes, como hoja de estilos. La carga cada página
 * desde el layout raíz: así las páginas estáticas siguen siendo estáticas y el cambio se ve al recargar.
 */
export async function GET() {
  return new Response(accentCss(await getAccent()), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
