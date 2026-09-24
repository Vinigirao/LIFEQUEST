import type { NextRequest } from "next/server";

/** URL pública do app (ex.: https://lifequest.vercel.app), sem barra no final. */
export function siteUrl(request?: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (request) return request.nextUrl.origin;
  return "http://localhost:3000";
}
