"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";

/** Salva a percepção de esforço (1 a 10) de um treino de força ou de uma atividade. null limpa. */
export async function setRpe(kind: "workout" | "cardio", id: string, rpe: number | null) {
  const { supabase } = await requireUser();
  const value = rpe == null ? null : Math.min(10, Math.max(1, Math.round(rpe)));
  const table = kind === "workout" ? "workout_sessions" : "cardio_sessions";
  await supabase.from(table).update({ rpe: value }).eq("id", id);
  revalidatePath(kind === "workout" ? "/treino" : "/cardio");
  if (kind === "workout") revalidatePath(`/treino/${id}`);
  revalidatePath("/analises");
}
