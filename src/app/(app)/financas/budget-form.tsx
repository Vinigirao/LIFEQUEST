"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { METHOD_LABEL, type Method } from "@/lib/finance/method";
import { saveBudget } from "./budget-actions";

type Category = { id: string; name: string; kind: string };

const SCOPES = [
  { value: "total", label: "Todos os gastos" },
  { value: "metodo", label: "Forma de pagamento" },
  { value: "categoria", label: "Categoria" },
  { value: "parcelado", label: "Compras parceladas" },
];

/** Criar/editar meta de gasto mensal. */
export function BudgetForm({
  categories,
  initial,
  onDone,
}: {
  categories: Category[];
  initial?: { id: string; name: string; scope: string; scope_value: string | null; monthly_limit: number };
  onDone?: () => void;
}) {
  const [scope, setScope] = useState(initial?.scope ?? "metodo");
  const [value, setValue] = useState(initial?.scope_value ?? "pix");
  const [name, setName] = useState(initial?.name ?? "");

  const autoName = () => {
    if (scope === "total") return "Gastos do mês";
    if (scope === "parcelado") return "Parcelas do mês";
    if (scope === "metodo") return METHOD_LABEL[value as Method] ?? "Forma de pagamento";
    return categories.find((c) => c.id === value)?.name ?? "Categoria";
  };

  return (
    <form
      action={async (fd) => {
        if (!String(fd.get("name") ?? "").trim()) fd.set("name", autoName());
        await saveBudget(fd);
        onDone?.();
      }}
      className="space-y-2"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-2 gap-2">
        <select
          name="scope"
          className="input"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setValue(e.target.value === "metodo" ? "pix" : e.target.value === "categoria" ? (categories[0]?.id ?? "") : "");
          }}
        >
          {SCOPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {scope === "metodo" ? (
          <select name="scope_value" className="input" value={value} onChange={(e) => setValue(e.target.value)}>
            {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        ) : scope === "categoria" ? (
          <select name="scope_value" className="input" value={value} onChange={(e) => setValue(e.target.value)}>
            {categories
              .filter((c) => c.kind === "despesa")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        ) : (
          <div />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName()} className="input" />
        <input
          name="monthly_limit"
          inputMode="decimal"
          defaultValue={initial?.monthly_limit ?? ""}
          placeholder="Limite R$/mês"
          className="input"
          required
        />
      </div>
      <SubmitButton className="btn btn-primary w-full">{initial ? "Salvar meta" : "Criar meta"}</SubmitButton>
    </form>
  );
}
