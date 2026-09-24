import { NextResponse, type NextRequest } from "next/server";
import { siteUrl } from "@/lib/site-url";
import { exchangeCode, syncActivities } from "@/lib/strava";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const base = siteUrl(request);
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const expected = request.cookies.get("strava_state")?.value;

  const fail = (reason: string) => NextResponse.redirect(`${base}/cardio?strava=erro&motivo=${encodeURIComponent(reason)}`);

  if (params.get("error")) return fail("acesso negado no Strava");
  if (!code || !state || state !== expected) return fail("sessão expirada, tente de novo");
  if (!(params.get("scope") ?? "").includes("activity:read")) return fail("marque a permissão de ver atividades");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`);

  try {
    const t = await exchangeCode(code);
    const admin = createAdminClient();
    const { error } = await admin.from("strava_connections").upsert({
      user_id: user.id,
      athlete_id: t.athlete?.id,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(t.expires_at * 1000).toISOString(),
      scope: params.get("scope"),
      last_sync_at: null,
    });
    if (error) throw new Error(error.message);
    await syncActivities(admin, user.id);
  } catch (e) {
    console.error("Strava callback", e);
    return fail("não foi possível conectar");
  }

  const response = NextResponse.redirect(`${base}/cardio?strava=ok`);
  response.cookies.delete("strava_state");
  return response;
}
