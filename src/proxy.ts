import { NextResponse, type NextRequest } from "next/server";

/**
 * Versão beta sem login.
 *
 * Proteção opcional: se a variável APP_ACCESS_KEY estiver configurada na Vercel,
 * o app só abre em aparelhos que visitaram uma vez  https://SEU-APP/?chave=<APP_ACCESS_KEY>.
 * Essa visita grava um cookie que vale por 1 ano. Sem a variável, o app fica aberto.
 */
const COOKIE = "lq_access";
const OPEN_PATHS = ["/api/cron", "/api/strava/webhook"];

export function proxy(request: NextRequest) {
  const key = process.env.APP_ACCESS_KEY;
  if (!key) return NextResponse.next();

  const { pathname, searchParams } = request.nextUrl;
  if (OPEN_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (searchParams.get("chave") === key) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("chave");
    const response = NextResponse.redirect(url);
    response.cookies.set(COOKIE, key, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return response;
  }

  if (request.cookies.get(COOKIE)?.value === key) return NextResponse.next();

  return new NextResponse("Acesso restrito.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon.png|apple-icon.png|icons/).*)",
  ],
};
