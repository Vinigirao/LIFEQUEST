"use server";

import { revalidatePath } from "next/cache";
import { createConnectToken, pluggyConfigured, saveItem, syncPluggy } from "@/lib/pluggy";
import { requireUser } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/financas");
  revalidatePath("/");
  revalidatePath("/analises");
  revalidatePath("/config");
}

function summary(r: Awaited<ReturnType<typeof syncPluggy>>) {
  const base = `${r.inserted} lançamento(s) novo(s) em ${r.accounts} conta(s)`;
  return r.errors.length ? `${base}. Erro: ${r.errors[0]}` : `${base}.`;
}

export async function getPluggyConnectToken(): Promise<{ token?: string; error?: string }> {
  await requireUser();
  if (!pluggyConfigured()) return { error: "Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET na Vercel." };
  try {
    return { token: await createConnectToken() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Guarda a conexão criada pelo widget (ou colada à mão) e já sincroniza. */
export async function addPluggyItem(itemId: string): Promise<{ ok: boolean; message: string }> {
  const { supabase, user } = await requireUser();
  const id = itemId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Item ID inválido (formato esperado: xxxxxxxx-xxxx-...)." };
  try {
    const item = await saveItem(supabase, user.id, id);
    const r = await syncPluggy(supabase, user.id);
    refresh();
    return { ok: r.errors.length === 0, message: `${item.connector?.name ?? "Conexão"} adicionada. ${summary(r)}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function syncPluggyNow(): Promise<{ ok: boolean; message: string }> {
  const { supabase, user } = await requireUser();
  try {
    const r = await syncPluggy(supabase, user.id);
    refresh();
    return { ok: r.errors.length === 0, message: summary(r) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Remove a conexão só do LIFEQUEST (os lançamentos já importados ficam). */
export async function removePluggyItem(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("pluggy_items").delete().eq("id", String(formData.get("id")));
  refresh();
}
