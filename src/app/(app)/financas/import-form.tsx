"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Upload } from "lucide-react";
import { importStatement, type ImportResult } from "./actions";

export function ImportForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ImportResult | null, FormData>(importStatement, null);

  useEffect(() => {
    if (state?.ok && state.month) router.push(`/financas?m=${state.month}`);
  }, [state, router]);

  return (
    <form action={action} className="card space-y-3">
      <p className="font-semibold">Importar extrato</p>
      <p className="text-xs text-muted">
        Aceita o .xlsx do BTG (lê a Conta Corrente e o patrimônio do Sumário) ou .csv de qualquer banco com colunas de
        data, descrição e valor. Pode importar o mesmo arquivo de novo: o que já existe é ignorado.
      </p>
      <input
        type="file"
        name="file"
        accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-card-2 file:px-3 file:py-2 file:text-fg"
        required
      />
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="invert" className="h-4 w-4 accent-violet-500" />
        Fatura de cartão (valores positivos no arquivo são gastos)
      </label>
      <button className="btn btn-primary w-full" disabled={pending}>
        <Upload size={16} /> {pending ? "Importando..." : "Importar"}
      </button>
      {state && <p className={`text-sm ${state.ok ? "text-ok" : "text-bad"}`}>{state.message}</p>}
    </form>
  );
}
