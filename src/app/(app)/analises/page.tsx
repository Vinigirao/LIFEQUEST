import Link from "next/link";
import { Info } from "lucide-react";
import { IntakeChart, Scatter } from "@/components/charts";
import { LineChart } from "@/components/line-chart";
import { Empty, PageTitle, SectionTitle, fmt } from "@/components/ui";
import {
  buildFactors,
  consistencyGrid,
  correlate,
  dietByDay,
  energyBalance,
  explain,
  moodByTraining,
  runPerformance,
  strengthPerformance,
  strengthWord,
  type Activity,
  type Correlation,
  type Journal,
  type Meal,
  type Profile,
  type Weight,
  type Workout,
} from "@/lib/analytics";
import { isStrength } from "@/lib/activity-types";
import { addDays, todayISO } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";

const num = (v: unknown) => (v == null ? null : Number(v));

export default async function AnalisesPage() {
  const { supabase, user } = await requireUser();
  const today = todayISO();
  const from = addDays(today, -180);

  const [meals, weights, journal, acts, workouts, profile] = await Promise.all([
    supabase
      .from("meal_logs")
      .select("log_date, kcal, protein_g, carbs_g, fat_g, is_free_meal, eaten_at")
      .gte("log_date", from),
    supabase.from("body_logs").select("log_date, weight_kg").not("weight_kg", "is", null).gte("log_date", from),
    supabase.from("journal_entries").select("entry_date, mood, energy").gte("entry_date", from),
    supabase
      .from("cardio_sessions")
      .select("id, activity_date, activity_type, started_at, duration_min, distance_km, avg_hr, calories, rpe")
      .gte("activity_date", from),
    supabase
      .from("workout_sessions")
      .select("id, session_date, name, template_id, rpe, started_at, created_at, strava_activity_id, workout_sets(weight_kg, reps)")
      .gte("session_date", from),
    supabase.from("profiles").select("height_cm, birth_year, sex, weight_goal").eq("id", user.id).maybeSingle(),
  ]);

  const mealRows: Meal[] = (meals.data ?? []).map((m) => ({
    log_date: m.log_date,
    kcal: Number(m.kcal),
    protein_g: Number(m.protein_g),
    carbs_g: Number(m.carbs_g),
    fat_g: Number(m.fat_g),
    is_free_meal: m.is_free_meal,
    eaten_at: m.eaten_at,
  }));
  const weightRows: Weight[] = (weights.data ?? []).map((w) => ({ log_date: w.log_date, weight_kg: Number(w.weight_kg) }));
  const journalRows: Journal[] = journal.data ?? [];
  const actRows: Activity[] = (acts.data ?? []).map((a) => ({
    ...a,
    duration_min: Number(a.duration_min),
    distance_km: num(a.distance_km),
    avg_hr: num(a.avg_hr),
    calories: num(a.calories),
  }));
  const workoutRows: Workout[] = (workouts.data ?? []).map((w) => ({
    ...w,
    volume: (w.workout_sets as { weight_kg: number; reps: number }[]).reduce((s, x) => s + Number(x.weight_kg) * x.reps, 0),
  }));
  const prof = (profile.data ?? null) as Profile | null;

  // ---------------- energia
  const eb = energyBalance(mealRows, weightRows, actRows, prof, today);
  const diet = dietByDay(mealRows);
  const last28 = Array.from({ length: 28 }, (_, i) => addDays(today, i - 28));
  const intakeDays = last28.map((d) => ({ date: d, kcal: diet.get(d)?.kcal ?? null }));
  const diff = eb.avgIntake != null && eb.targetKcal != null ? eb.avgIntake - eb.targetKcal : null;
  const goalLabel = { perder: "perder peso", manter: "manter o peso", ganhar: "ganhar massa" }[prof?.weight_goal ?? "manter"];

  // ---------------- desempenho
  const trainingDates = [
    ...workoutRows.map((w) => w.session_date),
    ...actRows.filter((a) => isStrength(a.activity_type)).map((a) => a.activity_date),
  ];
  const factors = buildFactors(mealRows, journalRows, [...trainingDates, ...actRows.map((a) => a.activity_date)]);
  const strength = strengthPerformance(workoutRows);
  const runs = runPerformance(actRows);
  const correlations: Correlation[] = [
    ...correlate(strength, factors, "forca"),
    ...correlate(runs, factors, "corrida"),
  ]
    .filter((c) => Math.abs(c.r) >= 0.2)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, 6);

  // ---------------- humor
  const mood = moodByTraining(journalRows, [...trainingDates, ...actRows.map((a) => a.activity_date)]);

  // ---------------- consistência
  const activeDates = new Set([...trainingDates, ...actRows.map((a) => a.activity_date)]);
  const grid = consistencyGrid(today, activeDates);
  const weightSeries = weightRows
    .filter((w) => w.log_date >= addDays(today, -90))
    .sort((a, b) => a.log_date.localeCompare(b.log_date))
    .map((w) => ({ date: w.log_date, value: w.weight_kg }));

  return (
    <>
      <PageTitle title="Análises" subtitle="O que seus dados dizem" />

      {/* ------------------------------------------------ Energia */}
      <SectionTitle>Balanço de energia · 28 dias</SectionTitle>
      <div className="card space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-bold">{fmt(eb.avgIntake)}</p>
            <p className="text-[11px] text-muted">kcal/dia comidas</p>
          </div>
          <div>
            <p className="text-xl font-bold">{fmt(eb.tdee)}</p>
            <p className="text-[11px] text-muted">
              gasto/dia {eb.tdeeSource === "dados" ? "(seus dados)" : eb.tdeeSource === "formula" ? "(fórmula)" : ""}
            </p>
          </div>
          <div>
            <p className="text-xl font-bold">
              {eb.weightPerWeek == null ? "–" : `${eb.weightPerWeek > 0 ? "+" : ""}${fmt(eb.weightPerWeek, 2)}`}
            </p>
            <p className="text-[11px] text-muted">kg/semana</p>
          </div>
        </div>

        <IntakeChart days={intakeDays} target={eb.tdee} />

        {eb.targetKcal != null && eb.avgIntake != null && diff != null ? (
          <div
            className={`rounded-xl p-3 text-sm ${
              Math.abs(diff) <= 150 ? "bg-ok/10 text-ok" : Math.abs(diff) <= 400 ? "bg-warn/10 text-warn" : "bg-bad/10 text-bad"
            }`}
          >
            Para {goalLabel}, o ideal é comer cerca de <b>{fmt(eb.targetKcal)} kcal/dia</b>. Você está comendo{" "}
            <b>
              {fmt(Math.abs(diff))} kcal {diff > 0 ? "a mais" : "a menos"}
            </b>
            {Math.abs(diff) <= 150 ? ": está no ponto." : "."}
          </div>
        ) : null}

        {eb.proteinTarget && eb.avgProtein != null ? (
          <p className="text-sm text-muted">
            Proteína: você come em média <b className="text-fg">{fmt(eb.avgProtein)} g</b>; para o seu peso o recomendado
            para quem treina é <b className="text-fg">{fmt(eb.proteinTarget[0])}–{fmt(eb.proteinTarget[1])} g</b>.
          </p>
        ) : null}

        <p className="text-xs text-muted">
          {eb.adaptiveTdee != null && eb.formulaTdee != null
            ? `Pelos seus dados o gasto é ${fmt(eb.adaptiveTdee)} kcal; pela fórmula (metabolismo + ${fmt(eb.avgActiveKcal)} kcal/dia de atividades do Strava), ${fmt(eb.formulaTdee)} kcal. `
            : ""}
          Refeições livres ficam fora da média.
        </p>
        {eb.missing.length > 0 && (
          <div className="flex gap-2 rounded-xl bg-card-2 p-3 text-xs text-muted">
            <Info size={16} className="shrink-0 text-accent" />
            <span>
              Para uma estimativa melhor falta: {eb.missing.join("; ")}.{" "}
              {!eb.bmr && (
                <Link href="/config" className="text-accent">
                  Preencher perfil
                </Link>
              )}
            </span>
          </div>
        )}
      </div>

      {weightSeries.length >= 2 && (
        <>
          <SectionTitle>Peso · 90 dias</SectionTitle>
          <div className="card">
            <LineChart points={weightSeries} unit="kg" />
          </div>
        </>
      )}

      {/* ------------------------------------------------ Desempenho */}
      <SectionTitle>O que anda junto com seu desempenho</SectionTitle>
      {correlations.length === 0 ? (
        <Empty>
          Ainda não há dados suficientes. Com uns 6 treinos do mesmo modelo (ou 6 corridas) e a dieta e o diário do dia
          anterior registrados, as relações aparecem aqui.
        </Empty>
      ) : (
        <div className="space-y-2">
          {correlations.map((c, i) => (
            <details key={`${c.metric}-${c.factor.key}`} className="card" open={i === 0}>
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">
                    {c.metric === "forca" ? "💪" : "🏃"} {c.factor.label}
                  </p>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${c.r > 0 ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad"}`}
                  >
                    {c.r > 0 ? "▲" : "▼"} {strengthWord(c.r)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{explain(c)}</p>
                <p className="mt-1 text-[11px] text-muted">
                  r = {c.r.toFixed(2).replace(".", ",")} · {c.n} {c.metric === "forca" ? "treinos" : "corridas"}
                </p>
              </summary>
              <div className="mt-3">
                <Scatter
                  points={c.points}
                  xLabel={`${c.factor.label} (${c.factor.unit})`}
                  yLabel={c.metric === "forca" ? "volume vs. sua média (%)" : "ritmo vs. sua média (%)"}
                />
                <p className="text-[11px] text-muted">
                  Eixo vertical: desempenho comparado com a sua média (100 = na média).
                </p>
              </div>
            </details>
          ))}
          <p className="text-xs text-muted">
            Correlação não prova causa: use como pista para testar. Quanto mais dias registrados, mais confiável.
          </p>
        </div>
      )}

      {/* ------------------------------------------------ Humor */}
      <SectionTitle>Humor e treino</SectionTitle>
      <div className="card">
        {mood.trainedAvg != null && mood.restAvg != null ? (
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-2xl font-bold">{fmt(mood.trainedAvg, 1)}</p>
              <p className="text-[11px] text-muted">humor em dias com treino ({mood.trainedN})</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{fmt(mood.restAvg, 1)}</p>
              <p className="text-[11px] text-muted">humor em dias sem treino ({mood.restN})</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Registre o humor no Diário para comparar dias com e sem treino.</p>
        )}
      </div>

      {/* ------------------------------------------------ Consistência */}
      <SectionTitle>Consistência · 12 semanas</SectionTitle>
      <div className="card">
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <div className="grid grid-rows-7 gap-1 text-[9px] leading-[14px] text-muted">
            {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {grid.flat().map((c) => (
              <span
                key={c.date}
                title={c.date}
                className="h-[14px] rounded-[3px]"
                style={{
                  background: c.future ? "transparent" : c.active ? "var(--color-accent)" : "var(--color-card-2)",
                }}
              />
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          {[...activeDates].filter((d) => d >= addDays(today, -28)).length} dias ativos nas últimas 4 semanas.
        </p>
      </div>
    </>
  );
}
