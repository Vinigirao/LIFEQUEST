import Link from "next/link";
import { BarChart3, Camera, Dumbbell, Flame, Footprints, Pencil, UtensilsCrossed, Wallet } from "lucide-react";
import { DayScale } from "@/components/day-scale";
import { Empty, PageTitle, ProgressBar, SectionTitle, StatusDot, fmt } from "@/components/ui";
import { formatDayLong, nowTimeSP, todayISO } from "@/lib/dates";
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
  const month = periodRange("month", today);
  const kcalToday = metricValue("kcal_media", data, today, today);
  const protToday = metricValue("proteina_media", data, today, today);
  const trainedToday = metricValue("treinos", data, today, today) ?? 0;
  const cardioKmWeek = metricValue("cardio_km", data, week.from, today) ?? 0;
  const spentMonth = metricValue("despesas", data, month.from, today) ?? 0;
  const greens = progress.filter((p) => p.status === "green").length;

  const { data: todayEntry } = await supabase
    .from("journal_entries")
    .select("mood, energy")
    .eq("entry_date", today)
    .maybeSingle();

  const hour = Number(nowTimeSP().slice(0, 2));
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const tiles = [
    { href: "/dieta", icon: Flame, value: fmt(kcalToday), label: `kcal hoje · ${fmt(protToday)} g prot` },
    { href: "/treino", icon: Dumbbell, value: trainedToday > 0 ? "Feito" : "–", label: "treino de força hoje" },
    { href: "/cardio", icon: Footprints, value: fmt(cardioKmWeek, 1), label: "km de cardio na semana" },
    {
      href: "/financas",
      icon: Wallet,
      value: spentMonth.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
      label: "gastos no mês",
    },
  ];

  return (
    <>
      <PageTitle
        title={greeting}
        subtitle={formatDayLong(today)}
        action={
          <Link href="/metas" className="btn btn-sm">
            <Pencil size={14} /> Metas
          </Link>
        }
      />

      <div className="card mb-3 space-y-3">
        <p className="text-sm font-semibold">Como você está hoje?</p>
        <div>
          <p className="label">Humor</p>
          <DayScale field="mood" value={todayEntry?.mood ?? null} />
        </div>
        <div>
          <p className="label">Energia</p>
          <DayScale field="energy" value={todayEntry?.energy ?? null} />
        </div>
        <Link href="/diario" className="block text-xs text-accent">
          Escrever no diário →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tiles.map(({ href, icon: Icon, value, label }) => (
          <Link key={href} href={href} className="card p-3 transition active:scale-[0.98]">
            <Icon size={18} className="text-accent" />
            <p className="mt-2 text-xl font-bold">{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px] text-muted">
        {[
          { href: "/dieta", icon: UtensilsCrossed, label: "Refeição" },
          { href: "/treino", icon: Dumbbell, label: "Treino" },
          { href: "/fotos", icon: Camera, label: "Foto" },
          { href: "/analises", icon: BarChart3, label: "Análises" },
        ].map(({ href, icon: Icon, label }) => (
          <Link key={label} href={href} className="flex flex-col items-center gap-1 rounded-xl border border-line bg-card py-2.5">
            <Icon size={18} className="text-fg" />
            {label}
          </Link>
        ))}
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
