"use server";

import { revalidatePath } from "next/cache";
import { categorize, suggestPattern, type Rule } from "@/lib/finance/categorize";
import { normalizeText } from "@/lib/finance/parse";
import { requireUser } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/financas");
  revalidatePath("/");
  revalidatePath("/analises");
}

async function loadRules(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]) {
  const { data } = await supabase.from("finance_rules").select("pattern, category_id");
  return (data ?? []) as Rule[];
}

/** Troca a categoria de um lançamento. Com "regra", aplica a todos os parecidos (e aos próximos). */
export async function setTransactionCategory(txId: string, categoryId: string | null, pattern: string | null) {
  const { supabase, user } = await requireUser();
  await supabase.from("finance_transactions").update({ category_id: categoryId }).eq("id", txId);

  if (pattern && categoryId) {
    const clean = normalizeText(pattern);
    if (clean.length >= 2) {
      await supabase
        .from("finance_rules")
        .upsert({ user_id: user.id, pattern: clean, category_id: categoryId }, { onConflict: "user_id,pattern" });
      const { data: txs } = await supabase.from("finance_transactions").select("id, description");
      const ids = (txs ?? []).filter((t) => normalizeText(t.description).includes(clean)).map((t) => t.id);
      for (let i = 0; i < ids.length; i += 200) {
        await supabase.from("finance_transactions").update({ category_id: categoryId }).in("id", ids.slice(i, i + 200));
      }
    }
  }
  refresh();
}

export async function suggestRule(description: string) {
  return suggestPattern(description);
}

/** Reaplica as regras nos lançamentos sem categoria. */
export async function recategorizeUncategorized() {
  const { supabase } = await requireUser();
  const rules = await loadRules(supabase);
  const { data: txs } = await supabase.from("finance_transactions").select("id, description").is("category_id", null);
  let n = 0;
  for (const t of txs ?? []) {
    const c = categorize(t.description, rules);
    if (c) {
      await supabase.from("finance_transactions").update({ category_id: c }).eq("id", t.id);
      n++;
    }
  }
  refresh();
  return n;
}

export async function addCategory(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "despesa");
  if (!name || !["despesa", "receita", "neutro"].includes(kind)) return;
  await supabase
    .from("finance_categories")
    .upsert({ user_id: user.id, name, kind, position: 50 }, { onConflict: "user_id,name" });
  refresh();
}

export async function deleteTransaction(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("finance_transactions").delete().eq("id", String(formData.get("id")));
  refresh();
}
