"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { categorize, suggestPattern, txKey, type Rule } from "@/lib/finance/categorize";
import { normalizeText, parseStatement } from "@/lib/finance/parse";
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

export type ImportResult = { ok: boolean; message: string; month?: string };

/** Importa o extrato (XLSX do BTG ou CSV). Lançamentos repetidos são ignorados. */
export async function importStatement(_: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const { supabase, user } = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Escolha um arquivo .xlsx ou .csv." };
  if (file.size > 4 * 1024 * 1024) return { ok: false, message: "Arquivo grande demais (máx. 4 MB)." };

  let parsed;
  try {
    parsed = parseStatement(new Uint8Array(await file.arrayBuffer()), file.name, formData.get("invert") === "on");
  } catch (e) {
    return { ok: false, message: `Não consegui ler o arquivo: ${(e as Error).message}` };
  }
  if (parsed.transactions.length === 0 && parsed.snapshots.length === 0) {
    return { ok: false, message: "Não encontrei lançamentos. O arquivo precisa ter colunas de data, descrição e valor." };
  }

  const rules = await loadRules(supabase);
  const seen = new Map<string, number>();
  const rows = parsed.transactions.map((t) => {
    const base = txKey(t.date, t.description, t.amount, 0);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const key = `${parsed.account ?? ""}|${txKey(t.date, t.description, t.amount, n)}`;
    return {
      user_id: user.id,
      tx_date: t.date,
      description: t.description.replace(/\s+/g, " ").trim(),
      amount: Math.round(t.amount * 100) / 100,
      balance: t.balance,
      category_id: categorize(t.description, rules),
      account: parsed.account,
      source: parsed.source,
      hash: createHash("sha1").update(key).digest("hex"),
    };
  });

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase
      .from("finance_transactions")
      .upsert(rows.slice(i, i + 500), { onConflict: "user_id,hash", ignoreDuplicates: true })
      .select("id");
    if (error) return { ok: false, message: `Erro ao salvar: ${error.message}` };
    inserted += data?.length ?? 0;
  }

  if (parsed.snapshots.length) {
    await supabase.from("net_worth_snapshots").upsert(
      parsed.snapshots.map((s) => ({
        user_id: user.id,
        snapshot_date: s.date,
        asset_class: s.assetClass,
        gross: s.gross,
        net: s.net,
      })),
      { onConflict: "user_id,snapshot_date,asset_class" },
    );
  }

  await supabase.from("finance_imports").insert({
    user_id: user.id,
    filename: file.name,
    rows_new: inserted,
    rows_duplicated: rows.length - inserted,
  });

  refresh();
  const last = rows.map((r) => r.tx_date).sort().at(-1);
  const dup = rows.length - inserted;
  return {
    ok: true,
    message: `${inserted} lançamento(s) novo(s)${dup ? `, ${dup} já existiam` : ""}${
      parsed.snapshots.length ? " · patrimônio atualizado" : ""
    }.`,
    month: last?.slice(0, 7),
  };
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
