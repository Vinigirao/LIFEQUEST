"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";

const SCOPES = ["total", "categoria", "metodo", "parcelado"];

/** "1.500", "1500,50", "1500.5", "R$ 800" → número */
function parseMoney(raw: string) {
  const v = raw.replace(/[^\d.,]/g, "");
  if (v.includes(",")) return Number(v.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) return Number(v.replace(/\./g, ""));
  return Number(v);
}

function refresh() {
  revalidatePath("/financas");
  revalidatePath("/");
}

export async function saveBudget(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const scope = String(formData.get("scope") ?? "total");
  const scopeValue = String(formData.get("scope_value") ?? "") || null;
  const limit = parseMoney(String(formData.get("monthly_limit") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  if (!SCOPES.includes(scope) || !Number.isFinite(limit) || limit <= 0 || !name) return;
  if ((scope === "categoria" || scope === "metodo") && !scopeValue) return;
  const row = {
    user_id: user.id,
    name,
    scope,
    scope_value: scope === "categoria" || scope === "metodo" ? scopeValue : null,
    monthly_limit: limit,
  };
  if (id) await supabase.from("finance_budgets").update(row).eq("id", id);
  else await supabase.from("finance_budgets").insert(row);
  refresh();
}

export async function deleteBudget(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("finance_budgets").delete().eq("id", String(formData.get("id")));
  refresh();
}
