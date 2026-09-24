import { NextResponse, type NextRequest } from "next/server";
import { sendPushToUser } from "@/lib/push";
import { computeNextRun, type ReminderSchedule } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Chamado a cada minuto pelo pg_cron do Supabase (ver supabase/cron.sql).
 * Envia os lembretes vencidos e agenda o próximo disparo.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const { data: due, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("active", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", now.toISOString())
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const r of due ?? []) {
    // Lembrete muito atrasado (ex.: app fora do ar) não dispara em rajada: só agenda o próximo
    const lateMinutes = (now.getTime() - new Date(r.next_run_at).getTime()) / 60000;
    if (lateMinutes <= 30) {
      sent += await sendPushToUser(supabase, r.user_id, {
        title: r.title,
        body: r.body ?? "",
        url: "/lembretes",
        tag: `reminder-${r.id}`,
      });
    }
    const next = computeNextRun(r as ReminderSchedule, now);
    await supabase
      .from("reminders")
      .update({
        last_sent_at: now.toISOString(),
        next_run_at: next?.toISOString() ?? null,
        active: next != null,
      })
      .eq("id", r.id);
  }

  return NextResponse.json({ processed: due?.length ?? 0, sent });
}
