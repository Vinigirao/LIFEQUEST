import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const STRAVA = "https://www.strava.com";

/** Tipos do Strava que NÃO entram no cardio (musculação fica na aba Treino). */
export const SKIP_TYPES = new Set(["WeightTraining"]);

export type StravaConnection = {
  user_id: string;
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  last_sync_at: string | null;
};

type StravaActivity = {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  start_date_local: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  average_heartrate?: number;
  total_elevation_gain?: number;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number };
};

function credentials() {
  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  if (!client_id || !client_secret) throw new Error("STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET não configurados");
  return { client_id, client_secret };
}

export function authorizeUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: credentials().client_id,
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state,
  });
  return `${STRAVA}/oauth/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${STRAVA}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...credentials(), ...body }),
  });
  if (!res.ok) throw new Error(`Strava token ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function exchangeCode(code: string) {
  return tokenRequest({ code, grant_type: "authorization_code" });
}

/** Devolve um access token válido, renovando se estiver perto de expirar. */
export async function getAccessToken(admin: SupabaseClient, conn: StravaConnection): Promise<string> {
  if (new Date(conn.expires_at).getTime() - Date.now() > 120_000) return conn.access_token;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.refresh_token });
  await admin
    .from("strava_connections")
    .update({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(t.expires_at * 1000).toISOString(),
    })
    .eq("user_id", conn.user_id);
  return t.access_token;
}

function toRow(a: StravaActivity, userId: string) {
  const type = a.sport_type || a.type || "Workout";
  const seconds = a.moving_time || a.elapsed_time || 0;
  return {
    user_id: userId,
    strava_id: a.id,
    source: "strava" as const,
    name: a.name,
    activity_type: type,
    // start_date_local vem como "2026-09-24T07:10:00Z", mas o horário já é o local
    activity_date: a.start_date_local.slice(0, 10),
    started_at: a.start_date,
    duration_min: Math.round((seconds / 60) * 100) / 100,
    distance_km: a.distance > 0 ? Math.round(a.distance) / 1000 : null,
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    elevation_m: a.total_elevation_gain ?? null,
  };
}

async function stravaGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${STRAVA}/api/v3${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Strava ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Importa as atividades recentes. Primeira vez: últimos 90 dias. */
export async function syncActivities(admin: SupabaseClient, userId: string): Promise<number> {
  const { data: conn } = await admin.from("strava_connections").select("*").eq("user_id", userId).single();
  if (!conn) throw new Error("Strava não conectado");
  const token = await getAccessToken(admin, conn as StravaConnection);

  const since = conn.last_sync_at
    ? new Date(conn.last_sync_at).getTime() - 3 * 86400_000 // margem para atividades enviadas com atraso
    : Date.now() - 90 * 86400_000;
  const after = Math.floor(since / 1000);

  let imported = 0;
  for (let page = 1; page <= 10; page++) {
    const list = await stravaGet<StravaActivity[]>(token, `/athlete/activities?after=${after}&per_page=100&page=${page}`);
    const rows = list.filter((a) => !SKIP_TYPES.has(a.sport_type || a.type || "")).map((a) => toRow(a, userId));
    if (rows.length) {
      const { error } = await admin.from("cardio_sessions").upsert(rows, { onConflict: "strava_id" });
      if (error) throw new Error(error.message);
      imported += rows.length;
    }
    if (list.length < 100) break;
  }

  await admin.from("strava_connections").update({ last_sync_at: new Date().toISOString() }).eq("user_id", userId);
  return imported;
}

/** Usado pelo webhook: importa/atualiza uma atividade específica. */
export async function upsertActivity(admin: SupabaseClient, conn: StravaConnection, activityId: number) {
  const token = await getAccessToken(admin, conn);
  const a = await stravaGet<StravaActivity>(token, `/activities/${activityId}`);
  if (SKIP_TYPES.has(a.sport_type || a.type || "")) return;
  await admin.from("cardio_sessions").upsert(toRow(a, conn.user_id), { onConflict: "strava_id" });
}

export async function deleteActivity(admin: SupabaseClient, activityId: number) {
  await admin.from("cardio_sessions").delete().eq("strava_id", activityId);
}

// ---------- webhook (inscrição feita uma vez pela tela de Configurações) ----------

export async function listWebhookSubscriptions(): Promise<{ id: number; callback_url: string }[]> {
  const { client_id, client_secret } = credentials();
  const res = await fetch(
    `${STRAVA}/api/v3/push_subscriptions?client_id=${client_id}&client_secret=${encodeURIComponent(client_secret)}`,
  );
  if (!res.ok) return [];
  return res.json();
}

export async function createWebhookSubscription(callbackUrl: string) {
  const { client_id, client_secret } = credentials();
  const verify_token = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  if (!verify_token) throw new Error("STRAVA_WEBHOOK_VERIFY_TOKEN não configurado");
  const body = new URLSearchParams({ client_id, client_secret, callback_url: callbackUrl, verify_token });
  const res = await fetch(`${STRAVA}/api/v3/push_subscriptions`, { method: "POST", body });
  if (!res.ok) throw new Error(`Strava respondeu ${res.status}: ${await res.text()}`);
  return res.json();
}
