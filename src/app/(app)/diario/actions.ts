"use server";

import { revalidatePath } from "next/cache";
import { safeDate } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";

function scale(v: FormDataEntryValue | null): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export async function saveJournal(formData: FormData) {
  const { supabase, user } = await requireUser();
  const entry_date = safeDate(String(formData.get("date") ?? ""));
  await supabase.from("journal_entries").upsert(
    {
      user_id: user.id,
      entry_date,
      content: String(formData.get("content") ?? ""),
      mood: scale(formData.get("mood")),
      energy: scale(formData.get("energy")),
    },
    { onConflict: "user_id,entry_date" },
  );
  revalidatePath("/diario");
  revalidatePath("/");
}
