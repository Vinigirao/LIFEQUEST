"use server";

import { revalidatePath } from "next/cache";
import { siteUrl } from "@/lib/site-url";
import { createWebhookSubscription, listWebhookSubscriptions } from "@/lib/strava";
import { requireUser } from "@/lib/supabase/server";

/** Cria (uma vez) a inscrição do webhook no Strava para receber atividades novas na hora. */
export async function setupStravaWebhook(): Promise<string> {
  await requireUser();
  try {
    const existing = await listWebhookSubscriptions();
    if (existing.length > 0) return `Webhook já ativo: ${existing[0].callback_url}`;
    await createWebhookSubscription(`${siteUrl()}/api/strava/webhook`);
    return "Webhook ativado. Atividades novas vão chegar sozinhas.";
  } catch (e) {
    return `Erro: ${(e as Error).message}`;
  }
}

/** Dados físicos usados para estimar o gasto calórico na aba Análises. */
export async function saveProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const height = Number(String(formData.get("height_cm") ?? "").replace(",", "."));
  const birth = Number(formData.get("birth_year"));
  const sex = String(formData.get("sex") ?? "");
  const goal = String(formData.get("weight_goal") ?? "");
  await supabase.from("profiles").upsert({
    id: user.id,
    height_cm: Number.isFinite(height) && height > 100 && height < 250 ? height : null,
    birth_year: Number.isInteger(birth) && birth > 1920 && birth < 2020 ? birth : null,
    sex: sex === "m" || sex === "f" ? sex : null,
    weight_goal: ["perder", "manter", "ganhar"].includes(goal) ? goal : null,
  });
  revalidatePath("/config");
  revalidatePath("/analises");
}
