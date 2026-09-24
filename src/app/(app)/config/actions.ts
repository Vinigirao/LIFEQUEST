"use server";

import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/site-url";
import { createWebhookSubscription, listWebhookSubscriptions } from "@/lib/strava";
import { requireUser } from "@/lib/supabase/server";

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/login");
}

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
