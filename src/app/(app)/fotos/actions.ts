"use server";

import { revalidatePath } from "next/cache";
import { safeDate } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";

type Input = {
  date: string;
  weight: string;
  waist: string;
  notes: string;
  photoPath: string | null; // null = manter a foto atual
};

const num = (v: string) => {
  const s = v.replace(",", ".").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function saveBodyLog(input: Input) {
  const { supabase, user } = await requireUser();
  const log_date = safeDate(input.date);

  const { data: current } = await supabase
    .from("body_logs")
    .select("photo_path")
    .eq("log_date", log_date)
    .maybeSingle();

  // Foto só pode ficar na pasta do próprio usuário
  const photoPath =
    input.photoPath && input.photoPath.startsWith(`${user.id}/`) ? input.photoPath : (current?.photo_path ?? null);

  const { error } = await supabase.from("body_logs").upsert(
    {
      user_id: user.id,
      log_date,
      weight_kg: num(input.weight),
      waist_cm: num(input.waist),
      notes: input.notes.trim() || null,
      photo_path: photoPath,
    },
    { onConflict: "user_id,log_date" },
  );
  if (error) throw new Error(error.message);

  // Substituiu a foto do dia: apaga o arquivo antigo
  if (current?.photo_path && current.photo_path !== photoPath) {
    await supabase.storage.from("body-photos").remove([current.photo_path]);
  }

  revalidatePath("/fotos");
  revalidatePath("/");
}

export async function deletePhoto(formData: FormData) {
  const { supabase } = await requireUser();
  const date = safeDate(String(formData.get("date") ?? ""));
  const { data: current } = await supabase.from("body_logs").select("photo_path").eq("log_date", date).maybeSingle();
  if (current?.photo_path) {
    await supabase.storage.from("body-photos").remove([current.photo_path]);
    await supabase.from("body_logs").update({ photo_path: null }).eq("log_date", date);
  }
  revalidatePath("/fotos");
  revalidatePath("/");
}
