import { NextResponse, type NextRequest } from "next/server";

// Nota: este middleware corre en el runtime Edge, así que NO puede importar
// `@/lib/auth` (usa node:crypto). Mantenemos el nombre de cookie sincronizado
// a mano con SESSION_COOKIE en src/lib/auth.ts.
const SESSION_COOKIE = "sunhub_session";

// Rutas que NO requieren sesión. Todo lo demás redirige a /login si no hay cookie.
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  // Para requests de API sin sesión, devolvemos 401 en vez de redirigir.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)"],
};
