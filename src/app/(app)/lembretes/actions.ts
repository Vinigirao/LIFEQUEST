"use server";

import { revalidatePath } from "next/cache";
import { safeDate, zonedToUtc } from "@/lib/dates";
import { sendPushToUser } from "@/lib/push";
import { computeNextRun, type ReminderSchedule } from "@/lib/schedule";
import { requireUser } from "@/lib/supabase/server";

// ---------- inscrição de push (um registro por aparelho) ----------

type SerializedSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function saveSubscription(sub: SerializedSubscription, userAgent: string) {
  const { supabase, user } = await requireUser();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Inscrição inválida");
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);
}

export async function removeSubscription(endpoint: string) {
  const { supabase } = await requireUser();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function sendTestPush(): Promise<number> {
  const { supabase, user } = await requireUser();
  return sendPushToUser(supabase, user.id, {
    title: "LIFEQUEST",
    body: "Notificações funcionando.",
    url: "/lembretes",
  });
}

// ---------- lembretes ----------

export async function createReminder(formData: FormData) {
  const { supabase, user } = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const body = String(formData.get("body") ?? "").trim() || null;
  const type = String(formData.get("schedule_type") ?? "daily") as ReminderSchedule["schedule_type"];
  const time = String(formData.get("time") ?? "08:00");

  const schedule: ReminderSchedule = {
    schedule_type: type,
    run_at: type === "once" ? zonedToUtc(safeDate(String(formData.get("date") ?? "")), time).toISOString() : null,
    time_of_day: type === "once" ? null : time,
    weekdays:
      type === "weekly"
        ? formData
            .getAll("weekdays")
            .map(Number)
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        : null,
  };
  if (type === "weekly" && (schedule.weekdays ?? []).length === 0) return;

  const next = computeNextRun(schedule);
  await supabase.from("reminders").insert({
    user_id: user.id,
    title,
    body,
    ...schedule,
    next_run_at: next?.toISOString() ?? null,
    active: next != null,
  });
  revalidatePath("/lembretes");
}

export async function toggleReminder(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id"));
  const { data: r } = await supabase.from("reminders").select("*").eq("id", id).single();
  if (!r) return;
  const active = !r.active;
  const next = active ? computeNextRun(r as ReminderSchedule) : null;
  await supabase
    .from("reminders")
    .update({ active: active && next != null, next_run_at: next?.toISOString() ?? null })
    .eq("id", id);
  revalidatePath("/lembretes");
}

export async function deleteReminder(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("reminders").delete().eq("id", String(formData.get("id")));
  revalidatePath("/lembretes");
}

export async function testReminder(formData: FormData) {
  const { supabase, user } = await requireUser();
  const { data: r } = await supabase.from("reminders").select("title, body").eq("id", String(formData.get("id"))).single();
  if (!r) return;
  await sendPushToUser(supabase, user.id, { title: r.title, body: r.body ?? "", url: "/lembretes" });
}
