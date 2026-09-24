"use server";

import { revalidatePath } from "next/cache";
import { safeDate } from "@/lib/dates";
import { syncActivities } from "@/lib/strava";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(",", ".").trim();
  return s === "" ? null : Number(s);
};

function refresh() {
  revalidatePath("/cardio");
  revalidatePath("/");
}

export async function addCardio(formData: FormData) {
  const { supabase, user } = await requireUser();
  const duration = num(formData.get("duration_min"));
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return;
  const distance = num(formData.get("distance_km"));
  const hr = num(formData.get("avg_hr"));
  await supabase.from("cardio_sessions").insert({
    user_id: user.id,
    activity_date: safeDate(String(formData.get("date") ?? "")),
    activity_type: String(formData.get("activity_type") ?? "Workout"),
    duration_min: duration,
    distance_km: distance != null && Number.isFinite(distance) ? distance : null,
    avg_hr: hr != null && Number.isFinite(hr) ? Math.round(hr) : null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    source: "manual",
  });
  refresh();
}

export async function deleteCardio(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("cardio_sessions").delete().eq("id", String(formData.get("id")));
  refresh();
}

export async function syncStrava(): Promise<{ ok: boolean; message: string }> {
  const { user } = await requireUser();
  try {
    const n = await syncActivities(createAdminClient(), user.id);
    refresh();
    return { ok: true, message: n > 0 ? `${n} atividade(s) atualizada(s).` : "Nada novo no Strava." };
  } catch (e) {
    return { ok: false, message: `Erro ao sincronizar: ${(e as Error).message}` };
  }
}

export async function disconnectStrava() {
  const { supabase, user } = await requireUser();
  await supabase.from("strava_connections").delete().eq("user_id", user.id);
  refresh();
}
