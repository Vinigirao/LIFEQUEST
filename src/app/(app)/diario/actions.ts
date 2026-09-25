"use server";

import { revalidatePath } from "next/cache";
import { safeDate } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";

export async function saveJournal(formData: FormData) {
  const { supabase, user } = await requireUser();
  const entry_date = safeDate(String(formData.get("date") ?? ""));
  await supabase.from("journal_entries").upsert(
    {
      user_id: user.id,
      entry_date,
      content: String(formData.get("content") ?? ""),
    },
    { onConflict: "user_id,entry_date" },
  );
  revalidatePath("/diario");
  revalidatePath("/");
}

/** Registro rápido de humor/energia do dia (tela inicial). Não mexe no texto do diário. */
export async function setDayScale(field: "mood" | "energy", value: number | null, date?: string) {
  const { supabase, user } = await requireUser();
  const v = value != null && Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
  await supabase
    .from("journal_entries")
    .upsert({ user_id: user.id, entry_date: safeDate(date), [field]: v }, { onConflict: "user_id,entry_date" });
  revalidatePath("/");
  revalidatePath("/diario");
  revalidatePath("/analises");
}
