import Link from "next/link";
import { ChevronLeft, ChevronRight, Landmark } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Empty, PageTitle, SectionTitle } from "@/components/ui";
import { formatDayShort, todayISO } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import { addCategory } from "./actions";
import { ImportForm } from "./import-form";
import { RecategorizeButton } from "./recategorize-button";
import { TxCategory } from "./tx-category";

type Category = { id: string; name: string; kind: "despesa" | "receita" | "neutro"; position: number };
type Tx = { id: string; tx_date: string; description: string; amount: number; category_id: string | null; account: string | null };
type Snapshot = { snapshot_date: string; asset_class: string; net: number | null; gross: number | null };

const brl = (n: number, digits = 0) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: digits, minimumFractionDigits: digits });

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
function monthEnd(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}

export default async function FinancasPage({ searchParams }: PageProps<"/financas">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;

  const { data: latest } = await supabase
    .from("finance_transactions")
    .select("tx_date")
    .order("tx_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fallback = latest?.tx_date?.slice(0, 7) ?? todayISO().slice(0, 7);
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : fallback;
  const onlyUncategorized = sp.f === "sem";
  const from6 = `${shiftMonth(month, -5)}-01`;

  const [{ data: cats }, { data: txs6 }, { data: snaps }] = await Promise.all([
    supabase.from("finance_categories").select("id, name, kind, position").order("position"),
    supabase
      .from("finance_transactions")
      .select("id, tx_date, description, amount, category_id, account")
      .gte("tx_date", from6)
      .lte("tx_date", monthEnd(month))
      .order("tx_date", { ascending: false })
      .limit(5000),
    supabase
      .from("net_worth_snapshots")
      .select("snapshot_date, asset_class, net, gross")
      .order("snapshot_date", { ascending: false })
      .limit(60),
  ]);

  const categories = (cats ?? []) as Category[];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const all = ((txs6 ?? []) as Tx[]).map((t) => ({ ...t, amount: Number(t.amount) }));
  const kindOf = (t: Tx) => (t.category_id ? catById.get(t.category_id)?.kind : undefined);

  // Classificação: sem categoria conta como gasto (se saída) ou entrada (se entrada) até ser revisado
  const isExpense = (t: Tx) => kindOf(t) === "despesa" || (!t.category_id && t.amount < 0);
  const isIncome = (t: Tx) => kindOf(t) === "receita" || (!t.category_id && t.amount > 0);

  const monthTx = all.filter((t) => t.tx_date.startsWith(month));
  const spent = -monthTx.filter(isExpense).reduce((s, t) => s + t.amount, 0);
  const income = monthTx.filter(isIncome).reduce((s, t) => s + t.amount, 0);
  const neutral = monthTx.filter((t) => kindOf(t) === "neutro").length;
  const uncategorized = monthTx.filter((t) => !t.category_id).length;

  const byCat = new Map<string, number>();
  for (const t of monthTx.filter(isExpense)) {
    const name = t.category_id ? catById.get(t.category_id)?.name ?? "?" : "Sem categoria";
    byCat.set(name, (byCat.get(name) ?? 0) - t.amount);
  }
  const catRows = [...byCat.entries()].filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  const maxCat = catRows[0]?.[1] ?? 1;

  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const perMonth = months.map((m) => ({
    m,
    spent: -all.filter((t) => t.tx_date.startsWith(m) && isExpense(t)).reduce((s, t) => s + t.amount, 0),
  }));
  const maxMonth = Math.max(1, ...perMonth.map((p) => p.spent));

  const snapshots = (snaps ?? []) as Snapshot[];
  const snapDates = [...new Set(snapshots.map((s) => s.snapshot_date))].sort().reverse();
  const totalOf = (d: string | undefined) =>
    d ? Number(snapshots.find((s) => s.snapshot_date === d && s.asset_class === "Total")?.net ?? 0) : 0;
  const lastSnap = snapDates[0];
  const prevSnap = snapDates[1];
  const classes = snapshots.filter((s) => s.snapshot_date === lastSnap && s.asset_class !== "Total" && Number(s.net) > 0);

  const list = onlyUncategorized ? monthTx.filter((t) => !t.category_id) : monthTx;

  return (
    <>
      <PageTitle title="Finanças" subtitle="Extratos, categorias e patrimônio" />

      <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-card px-2 py-1">
        <Link href={`/financas?m=${shiftMonth(month, -1)}`} className="p-2 text-muted" aria-label="Mês anterior">
          <ChevronLeft size={20} />
        </Link>
        <p className="text-sm font-semibold capitalize">{monthLabel(month)}</p>
        <Link href={`/financas?m=${shiftMonth(month, 1)}`} className="p-2 text-muted" aria-label="Próximo mês">
          <ChevronRight size={20} />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card px-2 py-3">
          <p className="text-[11px] text-muted">Entradas</p>
          <p className="font-bold text-ok">{brl(income)}</p>
        </div>
        <div className="card px-2 py-3">
          <p className="text-[11px] text-muted">Gastos</p>
          <p className="font-bold text-bad">{brl(spent)}</p>
        </div>
        <div className="card px-2 py-3">
          <p className="text-[11px] text-muted">Saldo</p>
          <p className={`font-bold ${income - spent >= 0 ? "text-ok" : "text-bad"}`}>{brl(income - spent)}</p>
        </div>
      </div>
      <p className="mt-1 text-center text-xs text-muted">
        {neutral} investimento(s)/transferência(s) não entram na conta
        {uncategorized ? (
          <>
            {" · "}
            <Link href={`/financas?m=${month}&f=sem`} className="text-warn">
              {uncategorized} sem categoria
            </Link>
          </>
        ) : null}
      </p>

      {catRows.length > 0 && (
        <>
          <SectionTitle>Gastos por categoria</SectionTitle>
          <div className="card space-y-2.5">
            {catRows.map(([name, v]) => (
              <div key={name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className={name === "Sem categoria" ? "text-warn" : ""}>{name}</span>
                  <span className="tabular-nums text-muted">
                    {brl(v)} · {Math.round((v / spent) * 100)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-card-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(v / maxCat) * 100}%`,
                      background: name === "Sem categoria" ? "var(--color-warn)" : "var(--color-accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Gastos nos últimos 6 meses</SectionTitle>
      <div className="card">
        <div className="flex h-32 items-end gap-2">
          {perMonth.map((p) => (
            <Link key={p.m} href={`/financas?m=${p.m}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] tabular-nums text-muted">{p.spent > 0 ? `${Math.round(p.spent / 100) / 10}k` : ""}</span>
              <div
                className="w-full rounded-t-md"
                style={{
                  height: `${Math.max(2, (p.spent / maxMonth) * 100)}%`,
                  background: p.m === month ? "var(--color-accent)" : "var(--color-line)",
                }}
              />
              <span className="text-[10px] text-muted">{monthLabel(p.m)}</span>
            </Link>
          ))}
        </div>
      </div>

      {lastSnap && (
        <>
          <SectionTitle>Patrimônio</SectionTitle>
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

      <SectionTitle
        action={
          onlyUncategorized ? (
            <Link href={`/financas?m=${month}`} className="text-xs text-accent">
              ver todos
            </Link>
          ) : (
            <RecategorizeButton />
          )
        }
      >
        {onlyUncategorized ? "Sem categoria" : "Lançamentos"}
      </SectionTitle>
      {list.length === 0 ? (
        <Empty>Nenhum lançamento neste mês. Importe um extrato abaixo.</Empty>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {list.slice(0, 300).map((t) => (
            <li key={t.id} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm leading-snug">{t.description}</p>
                  <p className="text-[11px] text-muted first-letter:uppercase">{formatDayShort(t.tx_date)}</p>
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
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <ImportForm />
      </div>

      <details className="card mt-3">
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
