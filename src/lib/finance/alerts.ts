import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "@/lib/dates";
import { sendPushToUser } from "@/lib/push";
import { evaluateBudgets, monthOf } from "./insights";
import { loadFinance } from "./load";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Envia push quando uma meta de gasto passa de 80% e de 100% no mês (uma vez por nível). */
export async function checkBudgetAlerts(admin: SupabaseClient, userId: string) {
  const today = todayISO();
  const month = monthOf(today);
  const { categories, txs, budgets } = await loadFinance(admin, `${month}-01`);
  if (!budgets.length) return 0;
  const progress = evaluateBudgets(budgets, txs, categories, month, today);
  const { data: sent } = await admin.from("finance_budget_alerts").select("budget_id, level").eq("month", month);
  const already = new Set((sent ?? []).map((s) => `${s.budget_id}|${s.level}`));
  let n = 0;
  for (const b of progress) {
    const level = b.pct >= 1 ? 100 : b.pct >= 0.8 ? 80 : 0;
    if (!level || already.has(`${b.id}|${level}`)) continue;
    try {
      await sendPushToUser(admin, userId, {
        title: level === 100 ? `Meta estourada: ${b.name}` : `Atenção: ${b.name} em ${Math.round(b.pct * 100)}%`,
        body: `${brl(b.spent)} de ${brl(b.monthly_limit)} no mês.`,
        url: "/financas?v=metas",
        tag: `budget-${b.id}`,
      });
    } catch {
      // sem push configurado: só registra
    }
    await admin.from("finance_budget_alerts").insert({ budget_id: b.id, user_id: userId, month, level });
    n++;
  }
  return n;
}
