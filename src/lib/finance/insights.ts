import { baseDescription, type Method } from "./method";
import { normalizeText } from "./parse";

/* Tudo aqui é cálculo puro (sem banco), para ficar fácil de testar. */

export type Kind = "despesa" | "receita" | "neutro";

export type Tx = {
  id: string;
  tx_date: string;
  description: string;
  amount: number;
  category_id: string | null;
  method: Method | null;
  account: string | null;
  installment_number: number | null;
  total_installments: number | null;
  status?: string | null;
};

export type Category = { id: string; name: string; kind: Kind };

export type Budget = {
  id: string;
  name: string;
  scope: "total" | "categoria" | "metodo" | "parcelado";
  scope_value: string | null;
  monthly_limit: number;
  active: boolean;
};

export const monthOf = (d: string) => d.slice(0, 7);

export function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function daysInMonthOf(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Classificador: o que é gasto, entrada ou neutro (investimento/transferência/fatura). */
export function classifier(categories: Category[]) {
  const kind = new Map(categories.map((c) => [c.id, c.kind]));
  const kindOf = (t: Tx): Kind => {
    if (t.category_id) return kind.get(t.category_id) ?? (t.amount < 0 ? "despesa" : "receita");
    return t.amount < 0 ? "despesa" : "receita";
  };
  /** valor gasto (positivo) — estorno numa categoria de gasto reduz o total */
  const spend = (t: Tx) => (kindOf(t) === "despesa" ? -t.amount : 0);
  const income = (t: Tx) => (kindOf(t) === "receita" ? t.amount : 0);
  return { kindOf, spend, income };
}

export function sum<T>(xs: T[], f: (x: T) => number) {
  return xs.reduce((s, x) => s + f(x), 0);
}

/* ------------------------------------------------------------- resumo do mês */

export function monthSummary(txs: Tx[], categories: Category[], month: string) {
  const { spend, income, kindOf } = classifier(categories);
  const inMonth = txs.filter((t) => monthOf(t.tx_date) === month);
  const spent = sum(inMonth, spend);
  const earned = sum(inMonth, income);

  const byMethod = new Map<Method, number>();
  for (const t of inMonth) {
    const v = spend(t);
    if (!v) continue;
    const m = (t.method ?? "outro") as Method;
    byMethod.set(m, (byMethod.get(m) ?? 0) + v);
  }

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const byCategory = new Map<string, number>();
  for (const t of inMonth) {
    const v = spend(t);
    if (!v) continue;
    const name = t.category_id ? (catName.get(t.category_id) ?? "?") : "Sem categoria";
    byCategory.set(name, (byCategory.get(name) ?? 0) + v);
  }

  const merchants = new Map<string, { total: number; count: number }>();
  for (const t of inMonth) {
    const v = spend(t);
    if (v <= 0) continue;
    const key = merchantName(t.description);
    const cur = merchants.get(key) ?? { total: 0, count: 0 };
    merchants.set(key, { total: cur.total + v, count: cur.count + 1 });
  }

  return {
    spent,
    earned,
    neutralCount: inMonth.filter((t) => kindOf(t) === "neutro").length,
    uncategorized: inMonth.filter((t) => !t.category_id).length,
    byMethod: [...byMethod.entries()].filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]),
    byCategory: [...byCategory.entries()].filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]),
    topMerchants: [...merchants.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6),
  };
}

/** Nome "limpo" do estabelecimento para agrupar. */
export function merchantName(description: string) {
  const base = baseDescription(description)
    .replace(/^(PIX (ENVIADO|RECEBIDO|TRANSF)|COMPRA (NO )?(CARTAO|DEBITO)|PAGAMENTO|PGTO)\s*[-:]?\s*/, "")
    .replace(/\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.split(" ").slice(0, 3).join(" ") || normalizeText(description).slice(0, 24);
}

/* ------------------------------------------------------------- ritmo diário */

/** Gasto acumulado por dia do mês (índice 0 = dia 1). */
export function cumulativeByDay(txs: Tx[], categories: Category[], month: string) {
  const { spend } = classifier(categories);
  const days = daysInMonthOf(month);
  const daily = Array.from({ length: days }, () => 0);
  for (const t of txs) {
    if (monthOf(t.tx_date) !== month) continue;
    const d = Number(t.tx_date.slice(8, 10)) - 1;
    daily[d] += spend(t);
  }
  let acc = 0;
  return daily.map((v) => (acc += v));
}

/** Projeção simples de fim de mês pelo ritmo até hoje. */
export function projectMonthEnd(spentSoFar: number, dayOfMonth: number, days: number) {
  if (dayOfMonth <= 0) return spentSoFar;
  return (spentSoFar / dayOfMonth) * days;
}

/* ------------------------------------------------------------- metas (orçamentos) */

export type BudgetProgress = Budget & {
  spent: number;
  pct: number;
  projected: number;
  status: "green" | "yellow" | "red";
  remaining: number;
  perDayLeft: number | null;
};

export function budgetSpent(b: Budget, txs: Tx[], categories: Category[], month: string) {
  const { spend } = classifier(categories);
  const inMonth = txs.filter((t) => monthOf(t.tx_date) === month);
  const filtered = inMonth.filter((t) => {
    if (b.scope === "categoria") return t.category_id === b.scope_value;
    if (b.scope === "metodo") return (t.method ?? "outro") === b.scope_value;
    if (b.scope === "parcelado") return (t.total_installments ?? 0) > 1;
    return true;
  });
  return sum(filtered, spend);
}

export function evaluateBudgets(
  budgets: Budget[],
  txs: Tx[],
  categories: Category[],
  month: string,
  today: string,
): BudgetProgress[] {
  const days = daysInMonthOf(month);
  const isCurrent = monthOf(today) === month;
  const day = isCurrent ? Number(today.slice(8, 10)) : days;
  return budgets
    .filter((b) => b.active)
    .map((b) => {
      const spent = budgetSpent(b, txs, categories, month);
      const limit = Number(b.monthly_limit);
      const projected = isCurrent ? projectMonthEnd(spent, day, days) : spent;
      const pct = limit > 0 ? spent / limit : 0;
      const expectedPct = day / days;
      const status: BudgetProgress["status"] =
        spent > limit ? "red" : projected > limit * 1.05 || pct > expectedPct + 0.15 ? "yellow" : "green";
      const remaining = limit - spent;
      const daysLeft = days - day + 1;
      return {
        ...b,
        monthly_limit: limit,
        spent,
        pct,
        projected,
        status,
        remaining,
        perDayLeft: isCurrent && remaining > 0 ? remaining / daysLeft : null,
      };
    });
}

/* ------------------------------------------------------------- parcelas futuras */

export type Committed = { month: string; amount: number }[];

/**
 * Parcelas que ainda vão cair nas próximas faturas.
 * Agrupa por compra (descrição sem "n/N" + valor + total de parcelas) e projeta as que faltam.
 */
export function futureInstallments(txs: Tx[], today: string, horizon = 12) {
  const groups = new Map<string, { amount: number; total: number; maxN: number; lastMonth: string; name: string }>();
  for (const t of txs) {
    const total = t.total_installments ?? 0;
    const n = t.installment_number ?? 0;
    if (total < 2 || n < 1 || t.amount >= 0) continue;
    const amount = -t.amount;
    const key = `${baseDescription(t.description)}|${amount.toFixed(2)}|${total}`;
    const g = groups.get(key);
    if (!g || n > g.maxN) {
      groups.set(key, { amount, total, maxN: n, lastMonth: monthOf(t.tx_date), name: merchantName(t.description) });
    }
  }
  const current = monthOf(today);
  const perMonth = new Map<string, number>();
  const purchases: { name: string; amount: number; remaining: number; total: number; nextN: number }[] = [];
  groups.forEach((g) => {
    const remaining = g.total - g.maxN;
    // parcelas já lançadas com data futura também são compromisso
    if (remaining <= 0 && g.lastMonth <= current) return;
    for (let k = 1; k <= remaining; k++) {
      const m = shiftMonth(g.lastMonth, k);
      perMonth.set(m, (perMonth.get(m) ?? 0) + g.amount);
    }
    if (g.lastMonth > current) perMonth.set(g.lastMonth, (perMonth.get(g.lastMonth) ?? 0) + g.amount);
    if (remaining > 0) purchases.push({ name: g.name, amount: g.amount, remaining, total: g.total, nextN: g.maxN + 1 });
  });
  const months = Array.from({ length: horizon }, (_, i) => shiftMonth(current, i + 1));
  const schedule = months.map((m) => ({ month: m, amount: perMonth.get(m) ?? 0 }));
  return {
    schedule,
    total: schedule.reduce((s, x) => s + x.amount, 0),
    purchases: purchases.sort((a, b) => b.amount * b.remaining - a.amount * a.remaining),
  };
}

/* ------------------------------------------------------------- recorrentes / assinaturas */

/** Gastos que se repetem em 3+ meses diferentes com valor parecido (±15%). */
export function recurring(txs: Tx[], categories: Category[], today: string) {
  const { spend } = classifier(categories);
  const since = shiftMonth(monthOf(today), -6);
  const map = new Map<string, { months: Set<string>; amounts: number[]; last: string }>();
  for (const t of txs) {
    const v = spend(t);
    if (v <= 0 || monthOf(t.tx_date) < since || (t.total_installments ?? 0) > 1) continue;
    const key = merchantName(t.description);
    const cur = map.get(key) ?? { months: new Set<string>(), amounts: [], last: t.tx_date };
    cur.months.add(monthOf(t.tx_date));
    cur.amounts.push(v);
    if (t.tx_date > cur.last) cur.last = t.tx_date;
    map.set(key, cur);
  }
  const out: { name: string; avg: number; months: number; last: string }[] = [];
  map.forEach((v, name) => {
    if (v.months.size < 3) return;
    const sorted = [...v.amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const similar = v.amounts.filter((a) => Math.abs(a - median) <= median * 0.15);
    if (similar.length < 3) return;
    const perMonth = similar.reduce((s, a) => s + a, 0) / v.months.size;
    out.push({ name, avg: perMonth, months: v.months.size, last: v.last });
  });
  return out.sort((a, b) => b.avg - a.avg);
}

/* ------------------------------------------------------------- comparação com mês anterior */

export function categoryDeltas(txs: Tx[], categories: Category[], month: string) {
  const prev = shiftMonth(month, -1);
  const cur = new Map(monthSummary(txs, categories, month).byCategory);
  const old = new Map(monthSummary(txs, categories, prev).byCategory);
  const names = new Set([...cur.keys(), ...old.keys()]);
  return [...names]
    .map((n) => ({ name: n, now: cur.get(n) ?? 0, before: old.get(n) ?? 0 }))
    .map((x) => ({ ...x, delta: x.now - x.before }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
