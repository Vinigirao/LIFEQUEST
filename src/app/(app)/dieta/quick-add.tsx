"use client";

import { useState, useTransition } from "react";
import { Clock, Plus } from "lucide-react";
import { logManualMeal, logSavedMeal } from "./actions";

type MealCard = { id: string; name: string; kcal: number; p: number; c: number; g: number };

const f = (n: number) => Math.round(n).toLocaleString("pt-BR");

/** Atalhos de 1 toque, com o horário da refeição (padrão: agora). */
export function QuickAdd({ date, meals, defaultTime }: { date: string; meals: MealCard[]; defaultTime: string }) {
  const [time, setTime] = useState(defaultTime);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  function send(key: string, action: (fd: FormData) => Promise<void>, fields: Record<string, string>) {
    const fd = new FormData();
    fd.set("date", date);
    fd.set("eaten_at", time);
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    setBusy(key);
    start(async () => {
      await action(fd);
      setBusy(null);
    });
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm">
        <Clock size={16} className="text-accent" />
        <span className="text-muted">Horário</span>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="ml-auto bg-transparent text-right font-semibold outline-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {meals.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={busy != null}
            onClick={() => send(m.id, logSavedMeal, { saved_meal_id: m.id })}
            className="card flex flex-col items-start text-left transition active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex w-full items-center justify-between font-semibold">
              {busy === m.id ? "Adicionando..." : m.name} <Plus size={16} className="text-accent" />
            </span>
            <span className="mt-1 text-xs text-muted">
              {f(m.kcal)} kcal · P {f(m.p)} · C {f(m.c)} · G {f(m.g)}
            </span>
          </button>
        ))}
        <button
          type="button"
          disabled={busy != null}
          onClick={() => send("free", logManualMeal, { is_free_meal: "1" })}
          className="card flex flex-col items-start text-left transition active:scale-[0.98] disabled:opacity-60"
        >
          <span className="flex w-full items-center justify-between font-semibold">
            {busy === "free" ? "Adicionando..." : "Refeição livre"} <Plus size={16} className="text-warn" />
          </span>
          <span className="mt-1 text-xs text-muted">sem contar macros</span>
        </button>
      </div>

      <details className="card">
        <summary className="cursor-pointer font-semibold">Outra refeição (manual)</summary>
        <form
          className="mt-3 space-y-2"
          action={async (fd) => {
            fd.set("date", date);
            fd.set("eaten_at", time);
            await logManualMeal(fd);
          }}
        >
          <input name="name" className="input" placeholder="Nome (ex.: Almoço fora)" />
          <div className="grid grid-cols-4 gap-2">
            <input name="kcal" inputMode="decimal" className="input px-2" placeholder="kcal" />
            <input name="protein_g" inputMode="decimal" className="input px-2" placeholder="P (g)" />
            <input name="carbs_g" inputMode="decimal" className="input px-2" placeholder="C (g)" />
            <input name="fat_g" inputMode="decimal" className="input px-2" placeholder="G (g)" />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="is_free_meal" value="1" className="h-4 w-4 accent-violet-500" />
            Marcar como refeição livre
          </label>
          <button className="btn btn-primary">Adicionar</button>
        </form>
      </details>
    </div>
  );
}
