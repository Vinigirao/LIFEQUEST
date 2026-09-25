"use client";

import { useState, useTransition } from "react";
import { setTransactionCategory, suggestRule } from "./actions";

type Category = { id: string; name: string; kind: string };

/** Troca a categoria; depois oferece criar uma regra para lançamentos parecidos. */
export function TxCategory({
  txId,
  description,
  categoryId,
  categories,
}: {
  txId: string;
  description: string;
  categoryId: string | null;
  categories: Category[];
}) {
  const [value, setValue] = useState(categoryId ?? "");
  const [ask, setAsk] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function change(v: string) {
    setValue(v);
    start(async () => {
      await setTransactionCategory(txId, v || null, null);
      if (v) setAsk(await suggestRule(description));
    });
  }

  function createRule() {
    if (!ask) return;
    start(async () => {
      await setTransactionCategory(txId, value || null, ask);
      setAsk(null);
    });
  }

  const groups: [string, string][] = [
    ["despesa", "Gastos"],
    ["receita", "Entradas"],
    ["neutro", "Não conta (investimentos, transferências)"],
  ];

  return (
    <div className="mt-1">
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        className={`w-full rounded-lg border bg-card-2 px-2 py-1 text-xs ${value ? "border-line text-muted" : "border-warn/60 text-warn"}`}
      >
        <option value="">Sem categoria</option>
        {groups.map(([kind, label]) => (
          <optgroup key={kind} label={label}>
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {ask !== null && (
        <div className="mt-2 rounded-lg bg-card-2 p-2 text-xs">
          <p className="text-muted">Usar essa categoria para tudo que contém:</p>
          <div className="mt-1 flex gap-1">
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1 text-xs"
            />
            <button type="button" onClick={createRule} disabled={pending} className="rounded bg-accent-strong px-2 text-white">
              Sim
            </button>
            <button type="button" onClick={() => setAsk(null)} className="rounded border border-line px-2 text-muted">
              Só este
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
