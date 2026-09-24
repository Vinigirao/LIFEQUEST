"use server";

import { revalidatePath } from "next/cache";
import { METRICS, type MetricKey } from "@/lib/goals";
import { requireUser } from "@/lib/supabase/server";

function parseGoal(formData: FormData) {
  const metric = String(formData.get("metric") ?? "") as MetricKey;
  const target = Number(String(formData.get("target") ?? "").replace(",", "."));
  const period = String(formData.get("period") ?? "week");
  const direction = String(formData.get("direction") ?? "gte");
  if (!(metric in METRICS) || !Number.isFinite(target) || target < 0) throw new Error("Meta inválida");
  if (!["day", "week", "month"].includes(period) || !["gte", "lte"].includes(direction)) throw new Error("Meta inválida");
  return { metric, target, period, direction };
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/metas");
  revalidatePath("/dieta");
}

export async function createGoal(formData: FormData) {
  const { supabase } = await requireUser();
  const goal = parseGoal(formData);
  const { count } = await supabase.from("goals").select("id", { count: "exact", head: true });
  await supabase.from("goals").insert({ ...goal, position: (count ?? 0) + 1 });
  refresh();
}

export async function updateGoal(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id"));
  const target = Number(String(formData.get("target") ?? "").replace(",", "."));
  const period = String(formData.get("period") ?? "week");
  const direction = String(formData.get("direction") ?? "gte");
  const active = formData.get("active") === "on";
  if (!Number.isFinite(target)) return;
  await supabase.from("goals").update({ target, period, direction, active }).eq("id", id);
  refresh();
}

export async function deleteGoal(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("goals").delete().eq("id", String(formData.get("id")));
  refresh();
}
