"use server";

import { revalidatePath } from "next/cache";
import { safeDate } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(",", ".").trim() || 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const round = (n: number) => Math.round(n * 10) / 10;

function refresh() {
  revalidatePath("/dieta");
  revalidatePath("/");
}

// ---------- registros do dia ----------

export async function logSavedMeal(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("saved_meal_id"));
  const servings = num(formData.get("servings")) || 1;
  const { data: meal } = await supabase
    .from("saved_meals")
    .select("id, name, saved_meal_items(kcal, protein_g, carbs_g, fat_g)")
    .eq("id", id)
    .single();
  if (!meal) return;

  const items = meal.saved_meal_items as { kcal: number; protein_g: number; carbs_g: number; fat_g: number }[];
  const sum = (k: "kcal" | "protein_g" | "carbs_g" | "fat_g") =>
    round(items.reduce((s, i) => s + Number(i[k]), 0) * servings);

  await supabase.from("meal_logs").insert({
    log_date: safeDate(String(formData.get("date") ?? "")),
    name: meal.name,
    saved_meal_id: meal.id,
    servings,
    kcal: sum("kcal"),
    protein_g: sum("protein_g"),
    carbs_g: sum("carbs_g"),
    fat_g: sum("fat_g"),
  });
  refresh();
}

export async function logManualMeal(formData: FormData) {
  const { supabase } = await requireUser();
  const isFree = formData.get("is_free_meal") === "1";
  await supabase.from("meal_logs").insert({
    log_date: safeDate(String(formData.get("date") ?? "")),
    name: String(formData.get("name") ?? "").trim() || (isFree ? "Refeição livre" : "Refeição"),
    kcal: num(formData.get("kcal")),
    protein_g: num(formData.get("protein_g")),
    carbs_g: num(formData.get("carbs_g")),
    fat_g: num(formData.get("fat_g")),
    is_free_meal: isFree,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  refresh();
}

export async function deleteMealLog(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("meal_logs").delete().eq("id", String(formData.get("id")));
  refresh();
}

// ---------- refeições salvas ----------

export async function createSavedMeal(formData: FormData) {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const { count } = await supabase.from("saved_meals").select("id", { count: "exact", head: true });
  await supabase.from("saved_meals").insert({ name, position: (count ?? 0) + 1 });
  revalidatePath("/dieta/refeicoes");
  revalidatePath("/dieta");
}

export async function renameSavedMeal(formData: FormData) {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("saved_meals").update({ name }).eq("id", String(formData.get("id")));
  revalidatePath("/dieta/refeicoes");
  revalidatePath("/dieta");
}

export async function deleteSavedMeal(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("saved_meals").delete().eq("id", String(formData.get("id")));
  revalidatePath("/dieta/refeicoes");
  revalidatePath("/dieta");
}

export async function addSavedMealItem(formData: FormData) {
  const { supabase } = await requireUser();
  const mealId = String(formData.get("saved_meal_id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const { count } = await supabase
    .from("saved_meal_items")
    .select("id", { count: "exact", head: true })
    .eq("saved_meal_id", mealId);
  await supabase.from("saved_meal_items").insert({
    saved_meal_id: mealId,
    name,
    portion: String(formData.get("portion") ?? "").trim() || null,
    kcal: num(formData.get("kcal")),
    protein_g: num(formData.get("protein_g")),
    carbs_g: num(formData.get("carbs_g")),
    fat_g: num(formData.get("fat_g")),
    position: (count ?? 0) + 1,
  });
  revalidatePath("/dieta/refeicoes");
  revalidatePath("/dieta");
}

export async function deleteSavedMealItem(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("saved_meal_items").delete().eq("id", String(formData.get("id")));
  revalidatePath("/dieta/refeicoes");
  revalidatePath("/dieta");
}
