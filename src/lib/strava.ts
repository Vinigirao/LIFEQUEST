import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STRENGTH_TYPES } from "./activity-types";

const STRAVA = "https://www.strava.com";

/** Quantas atividades buscam detalhe (FC, calorias) por sincronização, para respeitar o limite da API. */
const DETAIL_BATCH = 25;

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
  has_heartrate?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
  suffer_score?: number | null;
  // só no detalhe
  calories?: number;
  device_name?: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number };
};

class StravaRateLimit extends Error {}

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

async function stravaGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${STRAVA}/api/v3${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new StravaRateLimit("Limite da API do Strava atingido. Tente de novo em 15 minutos.");
  if (!res.ok) throw new Error(`Strava ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

const typeOf = (a: StravaActivity) => a.sport_type || a.type || "Workout";
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Campos que vêm na listagem (sempre as mesmas chaves, para o upsert em lote não apagar nada). */
function summaryRow(a: StravaActivity, userId: string) {
  const seconds = a.moving_time || a.elapsed_time || 0;
  return {
    user_id: userId,
    strava_id: a.id,
    source: "strava" as const,
    name: a.name,
    activity_type: typeOf(a),
    // start_date_local vem como "2026-09-24T07:10:00Z", mas o horário já é o local
    activity_date: a.start_date_local.slice(0, 10),
    started_at: a.start_date,
    duration_min: round2(seconds / 60),
    elapsed_min: round2((a.elapsed_time || seconds) / 60),
    distance_km: a.distance > 0 ? Math.round(a.distance) / 1000 : null,
    elevation_m: a.total_elevation_gain ?? null,
  };
}

/** Campos do detalhe: frequência cardíaca, calorias, esforço relativo e aparelho. */
function detailFields(a: StravaActivity) {
  return {
    avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    max_hr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    calories: a.calories ? Math.round(a.calories) : null,
    suffer_score: a.suffer_score ?? null,
    device_name: a.device_name ?? null,
    details_fetched: true,
  };
}

/** Busca o detalhe das atividades que ainda não têm FC/calorias (as mais recentes primeiro). */
async function fetchPendingDetails(admin: SupabaseClient, userId: string, token: string): Promise<number> {
  const { data: pending } = await admin
    .from("cardio_sessions")
    .select("id, strava_id")
    .eq("user_id", userId)
    .eq("source", "strava")
    .eq("details_fetched", false)
    .not("strava_id", "is", null)
    .order("activity_date", { ascending: false })
    .limit(DETAIL_BATCH);

  let done = 0;
  for (const row of pending ?? []) {
    try {
      const a = await stravaGet<StravaActivity>(token, `/activities/${row.strava_id}`);
      await admin.from("cardio_sessions").update(detailFields(a)).eq("id", row.id);
      done++;
    } catch (e) {
      if (e instanceof StravaRateLimit) break;
      // atividade apagada/privada: marca como buscada para não tentar de novo
      await admin.from("cardio_sessions").update({ details_fetched: true }).eq("id", row.id);
    }
  }
  return done;
}

/**
 * Liga treinos de força do Strava aos treinos registrados no app (mesmo dia).
 * Só liga automaticamente quando não há dúvida: 1 atividade de força e 1 treino sem vínculo no dia.
 */
export async function autoLinkStrength(admin: SupabaseClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10);
  const [{ data: acts }, { data: sessions }] = await Promise.all([
    admin
      .from("cardio_sessions")
      .select("id, activity_date, activity_type, started_at")
      .eq("user_id", userId)
      .gte("activity_date", since)
      .in("activity_type", [...STRENGTH_TYPES]),
    admin
      .from("workout_sessions")
      .select("id, session_date, strava_activity_id, started_at")
      .eq("user_id", userId)
      .gte("session_date", since),
  ]);

  const linked = new Set((sessions ?? []).map((s) => s.strava_activity_id).filter(Boolean));
  const freeActs = (acts ?? []).filter((a) => !linked.has(a.id));
  const freeSessions = (sessions ?? []).filter((s) => !s.strava_activity_id);

  let count = 0;
  for (const a of freeActs) {
    const sameDayActs = freeActs.filter((x) => x.activity_date === a.activity_date);
    const sameDaySessions = freeSessions.filter((s) => s.session_date === a.activity_date);
    if (sameDayActs.length !== 1 || sameDaySessions.length !== 1) continue;
    const s = sameDaySessions[0];
    const { error } = await admin
      .from("workout_sessions")
      .update({ strava_activity_id: a.id, started_at: s.started_at ?? a.started_at })
      .eq("id", s.id);
    if (!error) count++;
  }
  return count;
}

export type SyncResult = { imported: number; details: number; linked: number };

/** Importa as atividades recentes (primeira vez: últimos 90 dias) e completa FC/calorias. */
export async function syncActivities(admin: SupabaseClient, userId: string): Promise<SyncResult> {
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
    const rows = list.map((a) => summaryRow(a, userId));
    if (rows.length) {
      const { error } = await admin.from("cardio_sessions").upsert(rows, { onConflict: "strava_id" });
      if (error) throw new Error(error.message);
      imported += rows.length;
    }
    if (list.length < 100) break;
  }

  await admin.from("strava_connections").update({ last_sync_at: new Date().toISOString() }).eq("user_id", userId);
  const details = await fetchPendingDetails(admin, userId, token);
  const linked = await autoLinkStrength(admin, userId);
  return { imported, details, linked };
}

/** Usado pelo webhook: importa/atualiza uma atividade específica, já com o detalhe. */
export async function upsertActivity(admin: SupabaseClient, conn: StravaConnection, activityId: number) {
  const token = await getAccessToken(admin, conn);
  const a = await stravaGet<StravaActivity>(token, `/activities/${activityId}`);
  await admin
    .from("cardio_sessions")
    .upsert({ ...summaryRow(a, conn.user_id), ...detailFields(a) }, { onConflict: "strava_id" });
  if (STRENGTH_TYPES.has(typeOf(a))) await autoLinkStrength(admin, conn.user_id);
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
