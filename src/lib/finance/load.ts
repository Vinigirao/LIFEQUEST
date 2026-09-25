import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Budget, Category, Tx } from "./insights";
import type { Method } from "./method";

const PAGE = 1000; // o Supabase devolve no máximo 1000 linhas por consulta

type RawTx = Omit<Tx, "amount" | "method"> & { amount: number | string; method: string | null };

async function loadTxs(supabase: SupabaseClient, from: string, to?: string) {
  const out: RawTx[] = [];
  for (let page = 0; page < 20; page++) {
    let q = supabase
      .from("finance_transactions")
      .select("id, tx_date, description, amount, category_id, method, account, installment_number, total_installments, status")
      .gte("tx_date", from)
      .order("tx_date", { ascending: false })
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (to) q = q.lte("tx_date", to);
    const { data } = await q;
    const rows = (data ?? []) as RawTx[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Carrega categorias, metas e lançamentos a partir de uma data. */
export async function loadFinance(supabase: SupabaseClient, from: string, to?: string) {
  const [{ data: cats }, txs, { data: budgets }] = await Promise.all([
    supabase.from("finance_categories").select("id, name, kind").order("position"),
    loadTxs(supabase, from, to),
    supabase
      .from("finance_budgets")
      .select("id, name, scope, scope_value, monthly_limit, active")
      .order("position")
      .order("created_at"),
  ]);
  return {
    categories: (cats ?? []) as Category[],
    txs: txs.map((t) => ({ ...t, amount: Number(t.amount), method: (t.method ?? null) as Method | null })) as Tx[],
    budgets: ((budgets ?? []) as Budget[]).map((b) => ({ ...b, monthly_limit: Number(b.monthly_limit) })),
  };
}
