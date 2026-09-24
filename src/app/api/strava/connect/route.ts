import { NextResponse, type NextRequest } from "next/server";
import { siteUrl } from "@/lib/site-url";
import { authorizeUrl } from "@/lib/strava";

/** Início do login no Strava. O proxy garante que só usuário logado chega aqui. */
export async function GET(request: NextRequest) {
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(authorizeUrl(`${siteUrl(request)}/api/strava/callback`, state));
  response.cookies.set("strava_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
