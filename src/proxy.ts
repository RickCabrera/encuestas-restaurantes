import { type NextRequest, NextResponse } from "next/server";

/**
 * Pasa la ruta pedida al servidor en un header, para que el login pueda
 * regresar a esa página (p. ej. /admin/responses?low=1) tras iniciar sesión.
 * La verificación real de la sesión está en requireUser().
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-request-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/admin/:path*",
};
