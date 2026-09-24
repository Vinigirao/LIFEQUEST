"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDate } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", "."));

/** Usa o exercício escolhido ou cria um novo pelo nome digitado. */
async function resolveExercise(supabase: SupabaseClient, userId: string, formData: FormData): Promise<string | null> {
  const chosen = String(formData.get("exercise_id") ?? "");
  if (chosen && chosen !== "__new__") return chosen;
  const name = String(formData.get("new_exercise") ?? "").trim();
  if (!name) return null;
  const muscle_group = String(formData.get("muscle_group") ?? "").trim() || null;
  const { data } = await supabase
    .from("exercises")
    .upsert({ user_id: userId, name, muscle_group }, { onConflict: "user_id,name" })
    .select("id")
    .single();
  return data?.id ?? null;
}

// ---------- sessões ----------

export async function startWorkout(formData: FormData) {
  const { supabase } = await requireUser();
  const templateId = String(formData.get("template_id") ?? "") || null;
  let name = String(formData.get("name") ?? "").trim();
  if (templateId && !name) {
    const { data: t } = await supabase.from("workout_templates").select("name").eq("id", templateId).single();
    name = t?.name ?? "";
  }
  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      session_date: safeDate(String(formData.get("date") ?? "")),
      name: name || "Treino",
      template_id: templateId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Erro ao criar treino");
  revalidatePath("/treino");
  revalidatePath("/");
  redirect(`/treino/${data.id}`);
}

export async function updateWorkout(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id"));
  await supabase
    .from("workout_sessions")
    .update({
      name: String(formData.get("name") ?? "Treino").trim() || "Treino",
      session_date: safeDate(String(formData.get("date") ?? "")),
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .eq("id", id);
  revalidatePath(`/treino/${id}`);
  revalidatePath("/treino");
}

export async function deleteWorkout(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("workout_sessions").delete().eq("id", String(formData.get("id")));
  revalidatePath("/treino");
  revalidatePath("/");
  redirect("/treino");
}

// ---------- séries ----------

export async function addSet(formData: FormData) {
  const { supabase, user } = await requireUser();
  const sessionId = String(formData.get("session_id"));
  const exerciseId = await resolveExercise(supabase, user.id, formData);
  const weight = num(formData.get("weight"));
  const reps = Math.round(num(formData.get("reps")));
  if (!exerciseId || !Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0) return;

  const { count } = await supabase
    .from("workout_sets")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("exercise_id", exerciseId);

  await supabase.from("workout_sets").insert({
    session_id: sessionId,
    exercise_id: exerciseId,
    set_number: (count ?? 0) + 1,
    weight_kg: weight,
    reps,
  });
  revalidatePath(`/treino/${sessionId}`);
}

export async function deleteSet(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("workout_sets").delete().eq("id", String(formData.get("id")));
  revalidatePath(`/treino/${String(formData.get("session_id"))}`);
}

// ---------- exercícios ----------

export async function createExercise(formData: FormData) {
  const { supabase, user } = await requireUser();
  formData.set("exercise_id", "__new__");
  await resolveExercise(supabase, user.id, formData);
  revalidatePath("/treino/exercicios");
}

// ---------- modelos (Treino A, B, C...) ----------

export async function createTemplate(formData: FormData) {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("workout_templates").insert({ name });
  revalidatePath("/treino/modelos");
  revalidatePath("/treino");
}

export async function deleteTemplate(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("workout_templates").delete().eq("id", String(formData.get("id")));
  revalidatePath("/treino/modelos");
  revalidatePath("/treino");
}

export async function addTemplateExercise(formData: FormData) {
  const { supabase, user } = await requireUser();
  const templateId = String(formData.get("template_id"));
  const exerciseId = await resolveExercise(supabase, user.id, formData);
  if (!exerciseId) return;
  const { count } = await supabase
    .from("workout_template_exercises")
    .select("id", { count: "exact", head: true })
    .eq("template_id", templateId);
  const sets = Math.round(num(formData.get("target_sets")));
  await supabase.from("workout_template_exercises").insert({
    template_id: templateId,
    exercise_id: exerciseId,
    position: (count ?? 0) + 1,
    target_sets: Number.isFinite(sets) && sets > 0 ? sets : null,
    target_reps: String(formData.get("target_reps") ?? "").trim() || null,
  });
  revalidatePath("/treino/modelos");
}

export async function removeTemplateExercise(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("workout_template_exercises").delete().eq("id", String(formData.get("id")));
  revalidatePath("/treino/modelos");
}
