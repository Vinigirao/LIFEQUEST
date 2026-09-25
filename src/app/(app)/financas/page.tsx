import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Landmark,
  Layers,
  Repeat,
  Search,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import { DeleteButton, SubmitButton } from "@/components/submit-button";
import { Empty, PageTitle, ProgressBar, SectionTitle } from "@/components/ui";
import { formatDateTime, formatDayShort, todayISO } from "@/lib/dates";
import {
  budgetSpent,
  categoryDeltas,
  cumulativeByDay,
  daysInMonthOf,
  evaluateBudgets,
  futureInstallments,
  monthOf,
  monthSummary,
  projectMonthEnd,
  recurring,
  shiftMonth,
  type Budget,
  type BudgetProgress,
  type Category,
  type Tx,
} from "@/lib/finance/insights";
import { loadFinance } from "@/lib/finance/load";
import { METHOD_LABEL, METHOD_SHORT, type Method } from "@/lib/finance/method";
import { pluggyConfigured } from "@/lib/pluggy";
import { requireUser } from "@/lib/supabase/server";
import { addCategory } from "./actions";
import { deleteBudget, saveBudget } from "./budget-actions";
import { BudgetForm } from "./budget-form";
import { BurnChart, CommittedBars, MethodBar } from "./finance-charts";
import { PluggyConnect } from "./pluggy-connect";
import { removePluggyItem } from "./pluggy-actions";
import { RecategorizeButton } from "./recategorize-button";
import { TxCategory } from "./tx-category";

type PItem = { id: string; connector_name: string | null; last_sync_at: string | null; last_error: string | null };
type PAccount = {
  id: string;
  item_id: string;
  type: string | null;
  subtype: string | null;
  name: string | null;
  balance: number | null;
  credit_limit: number | null;
  available_credit: number | null;
  bill_amount: number | null;
  bill_due_date: string | null;
};
type Snapshot = { snapshot_date: string; asset_class: string; net: number | null; gross: number | null };

const VIEWS = [
  { key: "resumo", label: "Resumo" },
  { key: "metas", label: "Metas" },
  { key: "lancamentos", label: "Lançamentos" },
  { key: "contas", label: "Contas" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const brl = (n: number, digits = 0) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: digits, minimumFractionDigits: digits });

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const monthLong = (m: string) => `${MONTHS_LONG[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const isCard = (a: PAccount) => a.type === "CREDIT" || a.subtype === "CREDIT_CARD";
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

const STATUS_TEXT = { green: "no ritmo", yellow: "atenção", red: "estourou" } as const;
const STATUS_COLOR = { green: "var(--color-ok)", yellow: "var(--color-warn)", red: "var(--color-bad)" } as const;

function scopeLabel(b: Budget, categories: Category[]) {
  if (b.scope === "total") return "Todos os gastos";
  if (b.scope === "parcelado") return "Compras parceladas";
  if (b.scope === "metodo") return METHOD_LABEL[(b.scope_value ?? "outro") as Method] ?? "Forma de pagamento";
  return categories.find((c) => c.id === b.scope_value)?.name ?? "Categoria";
}

/** Arredonda sugestão de meta para múltiplos de 50. */
const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

export default async function FinancasPage({ searchParams }: PageProps<"/financas">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const currentMonth = monthOf(today);
  const month = /^\d{4}-\d{2}$/.test(str(sp.m)) ? str(sp.m) : currentMonth;
  const view: View = VIEWS.some((v) => v.key === sp.v) ? (sp.v as View) : "resumo";
  const href = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const all = { v: view, m: month, ...params };
    for (const [k, v] of Object.entries(all)) if (v && !(k === "v" && v === "resumo") && !(k === "m" && v === currentMonth)) q.set(k, v);
    const s = q.toString();
    return s ? `/financas?${s}` : "/financas";
  };

  // 7 meses para trás (comparações e recorrentes) e tudo que já foi lançado à frente (parcelas)
  const [{ categories, txs, budgets }, { data: pItems }, { data: pAccounts }, { data: snaps }] = await Promise.all([
    loadFinance(supabase, `${shiftMonth(month, -6)}-01`),
    supabase.from("pluggy_items").select("id, connector_name, last_sync_at, last_error").order("created_at"),
    supabase
      .from("pluggy_accounts")
      .select("id, item_id, type, subtype, name, balance, credit_limit, available_credit, bill_amount, bill_due_date")
      .order("type"),
    supabase
      .from("net_worth_snapshots")
      .select("snapshot_date, asset_class, net, gross")
      .order("snapshot_date", { ascending: false })
      .limit(60),
  ]);
  const items = (pItems ?? []) as PItem[];
  const accounts = ((pAccounts ?? []) as PAccount[]).map((a) => ({
    ...a,
    balance: a.balance == null ? null : Number(a.balance),
    credit_limit: a.credit_limit == null ? null : Number(a.credit_limit),
    available_credit: a.available_credit == null ? null : Number(a.available_credit),
    bill_amount: a.bill_amount == null ? null : Number(a.bill_amount),
  }));
  const progress = evaluateBudgets(budgets, txs, categories, month, today);

  return (
    <>
      <PageTitle title="Finanças" subtitle={items.length ? "Open Finance · atualiza sozinho todo dia" : "Conecte seu banco em Contas"} />

      <nav className="mb-3 grid grid-cols-4 gap-1 rounded-xl border border-line bg-card p-1 text-center text-[12px] font-medium">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href({ v: v.key, q: undefined })}
            className={`rounded-lg py-2 ${view === v.key ? "bg-accent-strong text-white" : "text-muted"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view !== "contas" && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-card px-2 py-1">
          <Link href={href({ m: shiftMonth(month, -1) })} className="p-2 text-muted" aria-label="Mês anterior">
            <ChevronLeft size={20} />
          </Link>
          <p className="text-sm font-semibold first-letter:uppercase">{monthLong(month)}</p>
          <Link href={href({ m: shiftMonth(month, 1) })} className="p-2 text-muted" aria-label="Próximo mês">
            <ChevronRight size={20} />
          </Link>
        </div>
      )}

      {view === "resumo" && (
        <Resumo
          month={month}
          today={today}
          txs={txs}
          categories={categories}
          budgets={budgets}
          progress={progress}
          href={href}
          hasBank={items.length > 0}
        />
      )}
      {view === "metas" && (
        <Metas month={month} today={today} txs={txs} categories={categories} budgets={budgets} progress={progress} />
      )}
      {view === "lancamentos" && (
        <Lancamentos
          month={month}
          txs={txs}
          categories={categories}
          filters={{ q: str(sp.q), metodo: str(sp.metodo), cat: str(sp.cat), f: str(sp.f) }}
          href={href}
        />
      )}
      {view === "contas" && (
        <Contas items={items} accounts={accounts} snapshots={(snaps ?? []) as Snapshot[]} txs={txs} today={today} />
      )}
    </>
  );
}

/* =============================================================== RESUMO */

function Resumo({
  month,
  today,
  txs,
  categories,
  budgets,
  progress,
  href,
  hasBank,
}: {
  month: string;
  today: string;
  txs: Tx[];
  categories: Category[];
  budgets: Budget[];
  progress: BudgetProgress[];
  href: (p: Record<string, string | undefined>) => string;
  hasBank: boolean;
}) {
  const prev = shiftMonth(month, -1);
  const s = monthSummary(txs, categories, month);
  const isCurrent = monthOf(today) === month;
  const days = daysInMonthOf(month);
  const day = isCurrent ? Number(today.slice(8, 10)) : days;
  const cur = cumulativeByDay(txs, categories, month);
  const old = cumulativeByDay(txs, categories, prev);
  // comparação justa: mesmo dia do mês anterior
  const prevSameDay = old[Math.min(day, old.length) - 1] ?? 0;
  const deltaPct = prevSameDay > 0 ? s.spent / prevSameDay - 1 : null;
  const projected = isCurrent ? projectMonthEnd(s.spent, day, days) : s.spent;
  const totalBudget = budgets.find((b) => b.active && b.scope === "total");
  const totalProg = progress.find((p) => p.scope === "total");
  const future = futureInstallments(txs, today, 12);
  const rec = recurring(txs, categories, today);
  const deltas = categoryDeltas(txs, categories, month).filter((d) => d.now > 0.5 || d.before > 0.5);
  const maxCat = Math.max(1, ...deltas.map((d) => d.now));
  const card = s.byMethod.find(([m]) => m === "cartao")?.[1] ?? 0;
  const pix = s.byMethod.find(([m]) => m === "pix")?.[1] ?? 0;
  const installmentsThisMonth = txs
    .filter((t) => monthOf(t.tx_date) === month && (t.total_installments ?? 0) > 1 && t.amount < 0)
    .reduce((acc, t) => acc - t.amount, 0);

  if (!txs.length) {
    return (
      <Empty>
        {hasBank ? (
          "Nenhum lançamento ainda. Toque em Sincronizar na aba Contas."
        ) : (
          <>
            Conecte seu banco na aba <Link href={href({ v: "contas" })} className="text-accent">Contas</Link> para começar.
          </>
        )}
      </Empty>
    );
  }

  return (
    <>
      {/* Hero */}
      <div className="card">
        <p className="text-xs text-muted">{isCurrent ? `Gasto até hoje (dia ${day})` : "Gasto no mês"}</p>
        <div className="flex items-end justify-between gap-2">
          <p className="text-3xl font-bold tracking-tight tabular-nums">{brl(s.spent)}</p>
          {deltaPct != null && (
            <p
              className={`mb-1 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                deltaPct > 0 ? "bg-bad/15 text-bad" : "bg-ok/15 text-ok"
              }`}
            >
              {deltaPct > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {pct(Math.abs(deltaPct))} vs {MONTHS[Number(prev.slice(5, 7)) - 1]}
            </p>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-card-2 px-1 py-2">
            <p className="text-[10px] text-muted">Entradas</p>
            <p className="text-sm font-semibold text-ok tabular-nums">{brl(s.earned)}</p>
          </div>
          <div className="rounded-lg bg-card-2 px-1 py-2">
            <p className="text-[10px] text-muted">{isCurrent ? "Projeção" : "Sobrou"}</p>
            <p
              className={`text-sm font-semibold tabular-nums ${
                isCurrent
                  ? totalBudget && projected > totalBudget.monthly_limit
                    ? "text-bad"
                    : ""
                  : s.earned - s.spent >= 0
                    ? "text-ok"
                    : "text-bad"
              }`}
            >
              {isCurrent ? brl(projected) : brl(s.earned - s.spent)}
            </p>
          </div>
          <div className="rounded-lg bg-card-2 px-1 py-2">
            <p className="text-[10px] text-muted">{totalProg?.perDayLeft != null ? "Pode gastar/dia" : "Média/dia"}</p>
            <p className="text-sm font-semibold tabular-nums">
              {totalProg?.perDayLeft != null ? brl(totalProg.perDayLeft) : brl(s.spent / Math.max(day, 1))}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <BurnChart current={cur} previous={old} limit={totalBudget?.monthly_limit ?? null} today={isCurrent ? day : null} />
          <p className="mt-1 flex items-center gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded bg-accent" /> este mês
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded bg-muted/60" /> {monthLabel(prev)}
            </span>
            {totalBudget && (
              <span className="inline-flex items-center gap-1 text-bad">
                <span className="inline-block h-0.5 w-4 rounded border-t border-dashed border-bad" /> meta
              </span>
            )}
          </p>
        </div>
      </div>

      {s.uncategorized > 0 && (
        <Link
          href={href({ v: "lancamentos", f: "sem" })}
          className="mt-2 flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn"
        >
          <AlertTriangle size={16} /> {s.uncategorized} lançamento(s) sem categoria — toque para revisar
        </Link>
      )}

      {/* Formas de pagamento */}
      <SectionTitle>Como o dinheiro saiu</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <MiniStat icon={<CreditCard size={16} />} label="Cartão" value={brl(card)} href={href({ v: "lancamentos", metodo: "cartao" })} />
        <MiniStat icon={<Wallet size={16} />} label="Pix" value={brl(pix)} href={href({ v: "lancamentos", metodo: "pix" })} />
        <MiniStat
          icon={<Layers size={16} />}
          label="Parcelas"
          value={brl(installmentsThisMonth)}
          href={href({ v: "lancamentos", f: "parcelas" })}
        />
      </div>
      {s.byMethod.length > 0 && (
        <div className="card mt-2">
          <MethodBar data={s.byMethod as [Method, number][]} />
        </div>
      )}

      {/* Metas */}
      <SectionTitle
        action={
          <Link href={href({ v: "metas" })} className="text-xs text-accent">
            {progress.length ? "ver todas" : "criar metas"}
          </Link>
        }
      >
        Metas do mês
      </SectionTitle>
      {progress.length === 0 ? (
        <Link href={href({ v: "metas" })} className="card flex items-center gap-3 text-sm">
          <Target className="shrink-0 text-accent" size={22} />
          <span>
            Defina limites para Pix, cartão, parcelas ou categorias. O app avisa por notificação quando chegar em 80% e 100%.
          </span>
        </Link>
      ) : (
        <div className="card space-y-3">
          {[...progress]
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 4)
            .map((b) => (
              <BudgetRow key={b.id} b={b} compact />
            ))}
        </div>
      )}

      {/* Categorias */}
      {deltas.length > 0 && (
        <>
          <SectionTitle>Categorias · vs {monthLabel(prev)}</SectionTitle>
          <div className="card space-y-2.5">
            {deltas
              .filter((d) => d.now > 0.5)
              .sort((a, b) => b.now - a.now)
              .slice(0, 10)
              .map((d) => (
                <div key={d.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className={`truncate ${d.name === "Sem categoria" ? "text-warn" : ""}`}>{d.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {brl(d.now)}
                      {d.before > 0.5 && Math.abs(d.delta) >= 1 && (
                        <span className={`ml-1.5 text-[11px] ${d.delta > 0 ? "text-bad" : "text-ok"}`}>
                          {d.delta > 0 ? "▲" : "▼"} {brl(Math.abs(d.delta))}
                        </span>
                      )}
                      {d.before <= 0.5 && <span className="ml-1.5 text-[11px] text-muted">novo</span>}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-card-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(d.now / maxCat) * 100}%`,
                        background: d.name === "Sem categoria" ? "var(--color-warn)" : "var(--color-accent)",
                      }}
                    />
                  </div>
                </div>
              ))}
            {deltas.some((d) => d.now <= 0.5 && d.before > 0.5) && (
              <p className="text-[11px] text-muted">
                Sem gasto este mês:{" "}
                {deltas
                  .filter((d) => d.now <= 0.5 && d.before > 0.5)
                  .map((d) => d.name)
                  .join(", ")}
              </p>
            )}
          </div>
        </>
      )}

      {/* Onde mais gastou */}
      {s.topMerchants.length > 0 && (
        <>
          <SectionTitle>Onde mais gastou</SectionTitle>
          <ul className="card divide-y divide-line py-1">
            {s.topMerchants.map(([name, v], i) => (
              <li key={name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-center text-xs text-muted">{i + 1}</span>
                  <Link href={href({ v: "lancamentos", q: name })} className="truncate">
                    {name}
                  </Link>
                </span>
                <span className="shrink-0 tabular-nums">
                  {brl(v.total)} <span className="text-[11px] text-muted">· {v.count}x</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Parcelas futuras */}
      {future.total > 0 && (
        <>
          <SectionTitle>Parcelas já comprometidas</SectionTitle>
          <div className="card">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold tabular-nums">{brl(future.total)}</p>
                <p className="text-xs text-muted">nos próximos 12 meses · {future.purchases.length} compra(s) parcelada(s)</p>
              </div>
              <CalendarClock className="text-accent" size={22} />
            </div>
            <CommittedBars schedule={future.schedule} />
            <ul className="mt-3 space-y-1.5 text-sm">
              {future.purchases.slice(0, 6).map((p) => (
                <li key={`${p.name}-${p.amount}-${p.total}`} className="flex justify-between gap-2">
                  <span className="truncate text-muted">{p.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {brl(p.amount)} <span className="text-[11px] text-muted">× {p.remaining} (até {p.total}/{p.total})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Assinaturas e contas fixas */}
      {rec.length > 0 && (
        <>
          <SectionTitle>Recorrentes e assinaturas</SectionTitle>
          <div className="card">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="text-xl font-bold tabular-nums">{brl(rec.reduce((a, r) => a + r.avg, 0))}/mês</p>
                <p className="text-xs text-muted">gastos que se repetem todo mês com valor parecido</p>
              </div>
              <Repeat className="text-accent" size={20} />
            </div>
            <ul className="divide-y divide-line">
              {rec.slice(0, 10).map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{r.name}</p>
                    <p className="text-[11px] text-muted">
                      {r.months} meses · último {formatDayShort(r.last)}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums">{brl(r.avg)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <p className="mt-4 text-center text-[11px] text-muted">
        {s.neutralCount} pagamento(s) de fatura, investimento(s) ou transferência(s) entre contas não entram no gasto.
      </p>
    </>
  );
}

function MiniStat({ icon, label, value, href }: { icon: ReactNode; label: string; value: string; href: string }) {
  return (
    <Link href={href} className="card px-2 py-3 text-center transition active:scale-[0.98]">
      <p className="flex items-center justify-center gap-1 text-[11px] text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 font-bold tabular-nums">{value}</p>
    </Link>
  );
}

function BudgetRow({ b, compact = false }: { b: BudgetProgress; compact?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className={`truncate ${compact ? "text-sm" : "font-semibold"}`}>{b.name}</p>
        <p className="shrink-0 text-sm tabular-nums">
          {brl(b.spent)} <span className="text-muted">/ {brl(b.monthly_limit)}</span>
        </p>
      </div>
      <ProgressBar pct={b.pct} status={b.status} />
      {compact && (
        <p className="mt-0.5 text-[11px]" style={{ color: STATUS_COLOR[b.status] }}>
          {pct(b.pct)} · {STATUS_TEXT[b.status]}
          {b.status !== "red" && b.projected > b.monthly_limit ? ` · projeção ${brl(b.projected)}` : ""}
        </p>
      )}
    </div>
  );
}

/* =============================================================== METAS */

function Metas({
  month,
  today,
  txs,
  categories,
  budgets,
  progress,
}: {
  month: string;
  today: string;
  txs: Tx[];
  categories: Category[];
  budgets: Budget[];
  progress: BudgetProgress[];
}) {
  const isCurrent = monthOf(today) === month;
  const inactive = budgets.filter((b) => !b.active);

  // Sugestões: média dos 3 meses anteriores − 10%, para o que ainda não tem meta
  const last3 = [1, 2, 3].map((k) => shiftMonth(month, -k));
  const avg = (b: Budget) => last3.reduce((acc, m) => acc + budgetSpent(b, txs, categories, m), 0) / 3;
  const draft = (scope: Budget["scope"], scope_value: string | null, name: string): Budget => ({
    id: "",
    name,
    scope,
    scope_value,
    monthly_limit: 0,
    active: true,
  });
  const candidates = [
    draft("total", null, "Gastos do mês"),
    draft("metodo", "pix", "Pix"),
    draft("metodo", "cartao", "Cartão de crédito"),
    draft("parcelado", null, "Compras parceladas"),
  ];
  const has = (c: Budget) => budgets.some((b) => b.scope === c.scope && (b.scope_value ?? null) === c.scope_value);
  const suggestions = candidates
    .filter((c) => !has(c))
    .map((c) => ({ ...c, avg: avg(c) }))
    .filter((c) => c.avg >= 50);

  return (
    <>
      {progress.length === 0 ? (
        <Empty>Nenhuma meta ainda. Crie abaixo ou use uma sugestão baseada nos seus últimos 3 meses.</Empty>
      ) : (
        <div className="space-y-2">
          {progress.map((b) => (
            <div key={b.id} className="card">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{b.name}</p>
                  {scopeLabel(b, categories) !== b.name && <p className="text-[11px] text-muted">{scopeLabel(b, categories)}</p>}
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ color: STATUS_COLOR[b.status], background: `color-mix(in srgb, ${STATUS_COLOR[b.status]} 15%, transparent)` }}
                >
                  {pct(b.pct)} · {STATUS_TEXT[b.status]}
                </span>
              </div>
              <div className="mb-1 flex items-baseline justify-between">
                <p className="text-xl font-bold tabular-nums">{brl(b.spent)}</p>
                <p className="text-sm text-muted tabular-nums">de {brl(b.monthly_limit)}</p>
              </div>
              <ProgressBar pct={b.pct} status={b.status} />
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-card-2 px-1 py-1.5">
                  <p className="text-[10px] text-muted">{b.remaining >= 0 ? "Resta" : "Passou"}</p>
                  <p className={`text-sm font-semibold tabular-nums ${b.remaining < 0 ? "text-bad" : ""}`}>
                    {brl(Math.abs(b.remaining))}
                  </p>
                </div>
                <div className="rounded-lg bg-card-2 px-1 py-1.5">
                  <p className="text-[10px] text-muted">{isCurrent ? "Projeção" : "Fechou em"}</p>
                  <p className={`text-sm font-semibold tabular-nums ${b.projected > b.monthly_limit ? "text-bad" : "text-ok"}`}>
                    {brl(b.projected)}
                  </p>
                </div>
                <div className="rounded-lg bg-card-2 px-1 py-1.5">
                  <p className="text-[10px] text-muted">Por dia</p>
                  <p className="text-sm font-semibold tabular-nums">{b.perDayLeft != null ? brl(b.perDayLeft) : "—"}</p>
                </div>
              </div>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs text-muted">editar</summary>
                <div className="mt-2">
                  <BudgetForm categories={categories} initial={b} />
                  <form action={deleteBudget} className="mt-2 text-right">
                    <input type="hidden" name="id" value={b.id} />
                    <DeleteButton className="text-xs text-bad" confirmText={`Apagar a meta "${b.name}"?`}>
                      apagar meta
                    </DeleteButton>
                  </form>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1">
              <Sparkles size={14} /> Sugestões
            </span>
          </SectionTitle>
          <div className="card divide-y divide-line py-1">
            {suggestions.map((c) => {
              const limit = round50(c.avg * 0.9);
              return (
                <form key={`${c.scope}-${c.scope_value}`} action={saveBudget} className="flex items-center justify-between gap-2 py-2">
                  <input type="hidden" name="scope" value={c.scope} />
                  <input type="hidden" name="scope_value" value={c.scope_value ?? ""} />
                  <input type="hidden" name="name" value={c.name} />
                  <input type="hidden" name="monthly_limit" value={String(limit)} />
                  <div className="min-w-0 text-sm">
                    <p className="truncate">
                      {c.name} até <b>{brl(limit)}</b>
                    </p>
                    <p className="text-[11px] text-muted">média dos últimos 3 meses: {brl(c.avg)} (−10%)</p>
                  </div>
                  <SubmitButton className="btn btn-sm shrink-0" pendingText="...">
                    Usar
                  </SubmitButton>
                </form>
              );
            })}
          </div>
        </>
      )}

      <SectionTitle>Nova meta</SectionTitle>
      <div className="card">
        <BudgetForm categories={categories} />
        <p className="mt-2 text-[11px] text-muted">
          Metas valem por mês. Você recebe uma notificação quando chegar em 80% e quando passar do limite.
        </p>
      </div>

      {inactive.length > 0 && <p className="mt-3 text-center text-xs text-muted">{inactive.length} meta(s) pausada(s)</p>}
    </>
  );
}

/* =============================================================== LANÇAMENTOS */

function Lancamentos({
  month,
  txs,
  categories,
  filters,
  href,
}: {
  month: string;
  txs: Tx[];
  categories: Category[];
  filters: { q: string; metodo: string; cat: string; f: string };
  href: (p: Record<string, string | undefined>) => string;
}) {
  const kind = new Map(categories.map((c) => [c.id, c.kind]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const q = filters.q.trim().toUpperCase();
  const list = txs
    .filter((t) => monthOf(t.tx_date) === month)
    .filter((t) => !q || t.description.toUpperCase().includes(q))
    .filter((t) => !filters.metodo || (t.method ?? "outro") === filters.metodo)
    .filter((t) => !filters.cat || (filters.cat === "sem" ? !t.category_id : t.category_id === filters.cat))
    .filter((t) => {
      if (filters.f === "saidas") return t.amount < 0;
      if (filters.f === "entradas") return t.amount > 0;
      if (filters.f === "parcelas") return (t.total_installments ?? 0) > 1;
      if (filters.f === "sem") return !t.category_id;
      return true;
    });
  // totais sem investimentos/transferências entre contas/fatura
  const counted = list.filter((t) => !t.category_id || kind.get(t.category_id) !== "neutro");
  const out = counted.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
  const inn = counted.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const F = [
    { key: "", label: "Tudo" },
    { key: "saidas", label: "Saídas" },
    { key: "entradas", label: "Entradas" },
    { key: "parcelas", label: "Parcelas" },
    { key: "sem", label: "Sem categoria" },
  ];
  const methods: Method[] = ["cartao", "pix", "debito", "boleto", "transferencia", "outro"];

  return (
    <>
      <form action="/financas" className="flex gap-2">
        <input type="hidden" name="v" value="lancamentos" />
        <input type="hidden" name="m" value={month} />
        {filters.metodo && <input type="hidden" name="metodo" value={filters.metodo} />}
        {filters.f && <input type="hidden" name="f" value={filters.f} />}
        <label className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={filters.q} placeholder="Buscar (ex.: ifood, uber)" className="input pl-9" />
        </label>
        <select name="cat" defaultValue={filters.cat} className="input w-32">
          <option value="">Categoria</option>
          <option value="sem">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn shrink-0" type="submit">
          Ir
        </button>
      </form>

      <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {F.map((f) => (
          <Link key={f.key || "all"} href={href({ f: f.key || undefined, q: filters.q, cat: filters.cat, metodo: filters.metodo })} className="chip shrink-0 text-xs" data-active={filters.f === f.key}>
            {f.label}
          </Link>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 mt-1 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <Link href={href({ f: filters.f, q: filters.q, cat: filters.cat })} className="chip shrink-0 text-xs" data-active={!filters.metodo}>
          Todas as formas
        </Link>
        {methods.map((m) => (
          <Link
            key={m}
            href={href({ f: filters.f, q: filters.q, cat: filters.cat, metodo: m })}
            className="chip shrink-0 text-xs"
            data-active={filters.metodo === m}
          >
            {METHOD_SHORT[m]}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>
          {list.length} lançamento(s) · <span className="text-bad">−{brl(out)}</span>
          {inn > 0 && (
            <>
              {" "}
              · <span className="text-ok">+{brl(inn)}</span>
            </>
          )}
        </span>
        <RecategorizeButton />
      </div>

      {list.length === 0 ? (
        <div className="mt-2">
          <Empty>Nada encontrado com esses filtros.</Empty>
        </div>
      ) : (
        <ul className="card mt-2 divide-y divide-line py-1">
          {list.slice(0, 400).map((t) => {
            const k = t.category_id ? kind.get(t.category_id) : undefined;
            return (
              <li key={t.id} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{t.description}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                      <span className="first-letter:uppercase">{formatDayShort(t.tx_date)}</span>
                      {t.method && <Badge>{METHOD_SHORT[t.method]}</Badge>}
                      {(t.total_installments ?? 0) > 1 && (
                        <Badge accent>
                          {t.installment_number}/{t.total_installments}
                        </Badge>
                      )}
                      {t.status === "PENDING" && <Badge>pendente</Badge>}
                      {k === "neutro" && <Badge>não conta</Badge>}
                      {t.account && <span className="truncate">· {t.account}</span>}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold tabular-nums ${t.amount < 0 ? "text-fg" : "text-ok"}`}>
                    {t.amount > 0 ? "+" : ""}
                    {brl(t.amount, 2)}
                  </p>
                </div>
                <TxCategory
                  key={`${t.id}-${t.category_id}`}
                  txId={t.id}
                  description={t.description}
                  categoryId={t.category_id}
                  categories={categories}
                />
                {t.category_id && !catName.has(t.category_id) && <p className="text-[11px] text-warn">categoria removida</p>}
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 400 && <p className="mt-2 text-center text-xs text-muted">Mostrando 400 de {list.length}. Use a busca.</p>}
    </>
  );
}

function Badge({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-px text-[10px] font-medium ${accent ? "bg-accent/15 text-accent" : "bg-card-2 text-muted"}`}
    >
      {children}
    </span>
  );
}

/* =============================================================== CONTAS */

function Contas({
  items,
  accounts,
  snapshots,
  txs,
  today,
}: {
  items: PItem[];
  accounts: PAccount[];
  snapshots: Snapshot[];
  txs: Tx[];
  today: string;
}) {
  const itemName = new Map(items.map((i) => [i.id, i.connector_name ?? "Banco"]));
  const lastSync = items.map((i) => i.last_sync_at).filter(Boolean).sort().at(-1) as string | undefined;
  const syncError = items.find((i) => i.last_error)?.last_error;
  const banks = accounts.filter((a) => !isCard(a));
  const cards = accounts.filter(isCard);
  const cash = banks.reduce((s, a) => s + (a.balance ?? 0), 0);
  const cardUsed = cards.reduce(
    (s, a) =>
      s + (a.credit_limit != null && a.available_credit != null ? a.credit_limit - a.available_credit : Math.abs(a.balance ?? 0)),
    0,
  );
  const future = futureInstallments(txs, today, 12);

  const snapDates = [...new Set(snapshots.map((s) => s.snapshot_date))].sort().reverse();
  const totalOf = (d: string | undefined) =>
    d ? Number(snapshots.find((s) => s.snapshot_date === d && s.asset_class === "Total")?.net ?? 0) : 0;
  const lastSnap = snapDates[0];
  const prevSnap = snapDates[1];
  const classes = snapshots.filter((s) => s.snapshot_date === lastSnap && s.asset_class !== "Total" && Number(s.net) > 0);

  return (
    <>
      {accounts.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="card">
            <p className="flex items-center gap-1 text-[11px] text-muted">
              <Landmark size={14} /> Saldo em conta
            </p>
            <p className={`text-xl font-bold tabular-nums ${cash < 0 ? "text-bad" : ""}`}>{brl(cash)}</p>
          </div>
          <div className="card">
            <p className="flex items-center gap-1 text-[11px] text-muted">
              <CreditCard size={14} /> Cartão usado
            </p>
            <p className="text-xl font-bold tabular-nums">{brl(cardUsed)}</p>
            {future.total > 0 && <p className="text-[10px] text-muted">+ {brl(future.total)} em parcelas futuras</p>}
          </div>
        </div>
      )}

      <SectionTitle>Contas conectadas</SectionTitle>
      <div className="card space-y-3">
        <div className="flex items-start justify-between">
          <p className="text-xs text-muted">
            Open Finance via Pluggy{lastSync ? ` · sincronizado ${formatDateTime(lastSync)}` : ""}
          </p>
          <Wallet size={18} className="shrink-0 text-accent" />
        </div>
        {!pluggyConfigured() ? (
          <p className="text-xs text-warn">
            Para ativar, crie as variáveis PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET na Vercel e faça Redeploy.
          </p>
        ) : (
          <>
            {accounts.length > 0 && (
              <ul className="divide-y divide-line">
                {[...cards, ...banks].map((a) => {
                  const card = isCard(a);
                  const used =
                    card && a.credit_limit != null && a.available_credit != null ? a.credit_limit - a.available_credit : null;
                  return (
                    <li key={a.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {card ? (
                            <CreditCard size={16} className="shrink-0 text-muted" />
                          ) : (
                            <Landmark size={16} className="shrink-0 text-muted" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm">{a.name}</p>
                            <p className="text-[11px] text-muted">{itemName.get(a.item_id)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">
                            {brl(card ? (used ?? Math.abs(a.balance ?? 0)) : (a.balance ?? 0), 2)}
                          </p>
                          <p className="text-[11px] text-muted">{card ? "usado" : "saldo"}</p>
                        </div>
                      </div>
                      {card && a.credit_limit ? (
                        <div className="mt-2">
                          <ProgressBar
                            pct={(used ?? 0) / a.credit_limit}
                            status={(used ?? 0) / a.credit_limit > 0.8 ? "red" : (used ?? 0) / a.credit_limit > 0.5 ? "yellow" : "green"}
                          />
                          <p className="mt-1 flex justify-between text-[11px] text-muted">
                            <span>
                              limite {brl(a.credit_limit)}
                              {a.available_credit != null ? ` · livre ${brl(a.available_credit)}` : ""}
                            </span>
                            {a.bill_due_date && (
                              <span>
                                fatura {a.bill_amount != null ? brl(a.bill_amount) : ""} vence {formatDayShort(a.bill_due_date)}
                              </span>
                            )}
                          </p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {syncError && <p className="text-xs text-bad">Última sincronização com erro: {syncError}</p>}
            <PluggyConnect hasItems={items.length > 0} />
            {items.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted">Conexões ({items.length})</summary>
                <ul className="mt-2 space-y-1">
                  {items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-muted">
                        {i.connector_name ?? "Banco"} · {i.id.slice(0, 8)}…
                      </span>
                      <form action={removePluggyItem}>
                        <input type="hidden" name="id" value={i.id} />
                        <DeleteButton className="text-bad" confirmText="Remover esta conexão do LIFEQUEST? (os lançamentos ficam)">
                          remover
                        </DeleteButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>

      {lastSnap && (
        <>
          <SectionTitle>Investimentos</SectionTitle>
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold">{brl(totalOf(lastSnap))}</p>
                <p className="text-xs text-muted first-letter:uppercase">líquido em {formatDayShort(lastSnap)}</p>
              </div>
              <Landmark className="text-accent" size={22} />
            </div>
            {prevSnap && (
              <p className={`mt-1 text-sm ${totalOf(lastSnap) >= totalOf(prevSnap) ? "text-ok" : "text-bad"}`}>
                {totalOf(lastSnap) >= totalOf(prevSnap) ? "+" : ""}
                {brl(totalOf(lastSnap) - totalOf(prevSnap))} desde {formatDayShort(prevSnap)}
              </p>
            )}
            <ul className="mt-3 space-y-1 text-sm">
              {classes.map((c) => (
                <li key={c.asset_class} className="flex justify-between">
                  <span className="text-muted">{c.asset_class}</span>
                  <span className="tabular-nums">{brl(Number(c.net))}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <details className="card mt-6">
        <summary className="cursor-pointer font-semibold">Nova categoria</summary>
        <form action={addCategory} className="mt-3 flex gap-2">
          <input name="name" className="input" placeholder="Ex.: Presentes" required />
          <select name="kind" className="input w-auto" defaultValue="despesa">
            <option value="despesa">Gasto</option>
            <option value="receita">Entrada</option>
            <option value="neutro">Não conta</option>
          </select>
          <SubmitButton className="btn btn-primary shrink-0">Criar</SubmitButton>
        </form>
      </details>
    </>
  );
}
