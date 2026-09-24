import Link from "next/link";
import { Dumbbell, Flame, Footprints, Pencil } from "lucide-react";
import { Empty, PageTitle, ProgressBar, SectionTitle, StatusDot, fmt } from "@/components/ui";
import { formatDayLong, todayISO } from "@/lib/dates";
import {
  METRICS,
  PERIOD_LABELS,
  evaluateGoal,
  fetchGoalData,
  formatValue,
  metricValue,
  periodRange,
  type Goal,
  type GoalProgress,
  type Period,
} from "@/lib/goals";
import { requireUser } from "@/lib/supabase/server";

export default async function MetasOverviewPage() {
  const { supabase } = await requireUser();
  const today = todayISO();

  const [{ data: goalsRaw }, data] = await Promise.all([
    supabase.from("goals").select("*").eq("active", true).order("position"),
    fetchGoalData(supabase, today),
  ]);

  const goals = (goalsRaw ?? []) as Goal[];
  const progress = goals.map((g) => evaluateGoal(g, data, today));
  const byPeriod: Record<Period, GoalProgress[]> = { day: [], week: [], month: [] };
  progress.forEach((p) => byPeriod[p.period].push(p));

  const week = periodRange("week", today);
  const kcalToday = metricValue("kcal_media", data, today, today);
  const protToday = metricValue("proteina_media", data, today, today);
  const trainedToday = metricValue("treinos", data, today, today) ?? 0;
  const cardioKmWeek = metricValue("cardio_km", data, week.from, today) ?? 0;
  const greens = progress.filter((p) => p.status === "green").length;

  return (
    <>
      <PageTitle
        title="Visão geral"
        subtitle={formatDayLong(today)}
        action={
          <Link href="/metas" className="btn btn-sm">
            <Pencil size={14} /> Metas
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3">
          <Flame size={18} className="text-accent" />
          <p className="mt-2 text-xl font-bold">{fmt(kcalToday)}</p>
          <p className="text-xs text-muted">kcal hoje · {fmt(protToday)} g prot</p>
        </div>
        <div className="card p-3">
          <Dumbbell size={18} className="text-accent" />
          <p className="mt-2 text-xl font-bold">{trainedToday > 0 ? "Feito" : "–"}</p>
          <p className="text-xs text-muted">treino hoje</p>
        </div>
        <div className="card p-3">
          <Footprints size={18} className="text-accent" />
          <p className="mt-2 text-xl font-bold">{fmt(cardioKmWeek, 1)}</p>
          <p className="text-xs text-muted">km na semana</p>
        </div>
      </div>

      {progress.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          <span className="font-semibold text-fg">{greens}</span> de {progress.length} metas no ritmo
        </p>
      )}

      {progress.length === 0 && (
        <div className="mt-6">
          <Empty>
            Nenhuma meta ativa. <Link href="/metas" className="text-accent">Criar metas</Link>
          </Empty>
        </div>
      )}

      {(["day", "week", "month"] as Period[]).map((period) =>
        byPeriod[period].length === 0 ? null : (
          <section key={period}>
            <SectionTitle>
              {period === "day" ? "Hoje" : period === "week" ? "Esta semana" : "Este mês"}
            </SectionTitle>
            <div className="space-y-2">
              {byPeriod[period].map((g) => (
                <GoalCard key={g.id} goal={g} />
              ))}
            </div>
          </section>
        ),
      )}
    </>
  );
}

function GoalCard({ goal }: { goal: GoalProgress }) {
  const def = METRICS[goal.metric];
  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <StatusDot status={goal.status} />
        <p className="flex-1 font-medium">{def.label}</p>
        <p className="text-sm tabular-nums">
          <span className="font-bold">{formatValue(goal.metric, goal.value)}</span>
          <span className="text-muted">
            {" "}
            {goal.direction === "lte" ? "≤" : "/"} {formatValue(goal.metric, goal.target)} {def.unit}
          </span>
        </p>
      </div>
      <div className="mt-3">
        <ProgressBar pct={goal.pct} status={goal.status} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {goal.hint} · {def.kind === "avg" ? "média " : ""}
        {PERIOD_LABELS[goal.period]}
      </p>
    </div>
  );
}
