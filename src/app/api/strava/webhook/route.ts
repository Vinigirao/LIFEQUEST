import { after, NextResponse, type NextRequest } from "next/server";
import { deleteActivity, upsertActivity, type StravaConnection } from "@/lib/strava";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Validação feita pelo Strava ao criar a inscrição do webhook. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": p.get("hub.challenge") });
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

type StravaEvent = {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, string>;
};

/**
 * Evento de atividade nova/alterada/apagada.
 * O Strava exige resposta em até 2 segundos, então o trabalho roda depois da resposta (after).
 */
export async function POST(request: NextRequest) {
  const event = (await request.json().catch(() => null)) as StravaEvent | null;
  if (!event || event.object_type !== "activity") return NextResponse.json({ ok: true });

  after(async () => {
    const admin = createAdminClient();
    const { data: conn } = await admin
      .from("strava_connections")
      .select("*")
      .eq("athlete_id", event.owner_id)
      .maybeSingle();
    if (!conn) return;
    try {
      if (event.aspect_type === "delete") await deleteActivity(admin, event.object_id);
      else await upsertActivity(admin, conn as StravaConnection, event.object_id);
    } catch (e) {
      console.error("Strava webhook", e);
    }
  });

  return NextResponse.json({ ok: true });
}
