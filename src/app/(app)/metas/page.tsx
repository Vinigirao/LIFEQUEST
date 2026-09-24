import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DeleteButton, SubmitButton } from "@/components/submit-button";
import { PageTitle, SectionTitle } from "@/components/ui";
import { METRICS, type Goal, type MetricKey } from "@/lib/goals";
import { requireUser } from "@/lib/supabase/server";
import { createGoal, deleteGoal, updateGoal } from "./actions";

function PeriodSelect({ value }: { value?: string }) {
  return (
    <select name="period" defaultValue={value ?? "week"} className="input">
      <option value="day">por dia</option>
      <option value="week">por semana</option>
      <option value="month">por mês</option>
    </select>
  );
}

function DirectionSelect({ value }: { value?: string }) {
  return (
    <select name="direction" defaultValue={value ?? "gte"} className="input">
      <option value="gte">no mínimo</option>
      <option value="lte">no máximo</option>
    </select>
  );
}

export default async function EditGoalsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("goals").select("*").order("position");
  const goals = (data ?? []) as Goal[];

  return (
    <>
      <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft size={16} /> Visão geral
      </Link>
      <PageTitle title="Editar metas" subtitle="Médias de dieta usam só os dias com registro (sem contar hoje, que ainda está em andamento)." />

      <div className="space-y-3">
        {goals.map((g) => (
          <form key={g.id} action={updateGoal} className="card space-y-3">
            <input type="hidden" name="id" value={g.id} />
            <div className="flex items-center justify-between">
              <p className="font-semibold">{METRICS[g.metric].label}</p>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" name="active" defaultChecked={g.active} className="h-4 w-4 accent-violet-500" />
                ativa
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <DirectionSelect value={g.direction} />
              <input
                name="target"
                defaultValue={g.target}
                inputMode="decimal"
                className="input"
                aria-label={`Alvo em ${METRICS[g.metric].unit}`}
              />
              <PeriodSelect value={g.period} />
            </div>
            <p className="text-xs text-muted">Unidade: {METRICS[g.metric].unit}</p>
            <div className="flex gap-2">
              <SubmitButton className="btn btn-sm btn-primary">Salvar</SubmitButton>
              <DeleteButton formAction={deleteGoal}>Apagar</DeleteButton>
            </div>
          </form>
        ))}
      </div>

      <SectionTitle>Nova meta</SectionTitle>
      <form action={createGoal} className="card space-y-3">
        <div>
          <label className="label">Métrica</label>
          <select name="metric" className="input" required>
            {(Object.keys(METRICS) as MetricKey[]).map((k) => (
              <option key={k} value={k}>
                {METRICS[k].label} ({METRICS[k].unit})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <DirectionSelect />
          <input name="target" inputMode="decimal" placeholder="Alvo" className="input" required />
          <PeriodSelect />
        </div>
        <SubmitButton>Adicionar meta</SubmitButton>
      </form>
      <DeleteHint />
    </>
  );
}

function DeleteHint() {
  return (
    <p className="mt-4 text-xs text-muted">
      Dica: para pausar uma meta sem perder a configuração, desmarque &quot;ativa&quot; e salve.
    </p>
  );
}

