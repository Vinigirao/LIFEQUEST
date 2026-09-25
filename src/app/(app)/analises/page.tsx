import Link from "next/link";
import { PageTitle } from "@/components/ui";
import type { Profile } from "@/lib/analytics";
import { addDays, todayISO } from "@/lib/dates";
import { loadFinance } from "@/lib/finance/load";
import { buildDaily, type RawActivity, type RawMeal, type RawWeight, type RawWorkout } from "@/lib/insights/daily";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { requireUser } from "@/lib/supabase/server";
import { Corpo } from "./corpo";
import type { Ctx } from "./ctx";
import { Relacoes } from "./relacoes";
import { Resumo } from "./resumo";
import { Rotina } from "./rotina";
import { Treino } from "./treino";

const VIEWS = [
  { key: "resumo", label: "Resumo" },
  { key: "relacoes", label: "Relações" },
  { key: "corpo", label: "Corpo" },
  { key: "treino", label: "Treino" },
  { key: "rotina", label: "Rotina" },
] as const;
type View = (typeof VIEWS)[number]["key"];
const PERIODS = [30, 90, 180] as const;

const num = (v: unknown) => (v == null ? null : Number(v));
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function AnalisesPage({ searchParams }: PageProps<"/analises">) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const view: View = VIEWS.some((v) => v.key === sp.v) ? (sp.v as View) : "resumo";
  const period = PERIODS.find((p) => String(p) === sp.p) ?? 90;
  const lag: 0 | 1 = sp.lag === "0" ? 0 : 1;
  const from = addDays(today, -Math.max(period, 60) - 40); // folga para tendências e "dia anterior"

  const href = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const all: Record<string, string | undefined> = { v: view, p: String(period), ...params };
    for (const [k, v] of Object.entries(all)) {
      if (!v) continue;
      if (k === "v" && v === "resumo") continue;
      if (k === "p" && v === "90") continue;
      q.set(k, v);
    }
    const s = q.toString();
    return s ? `/analises?${s}` : "/analises";
  };

  const [meals, weights, journal, acts, workouts, profile, fin] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from("meal_logs")
        .select("log_date, kcal, protein_g, carbs_g, fat_g, is_free_meal, eaten_at")
        .gte("log_date", from)
        .order("log_date")
        .order("id")
        .range(a, b),
    ),
    supabase.from("body_logs").select("log_date, weight_kg, waist_cm").gte("log_date", from),
    supabase.from("journal_entries").select("entry_date, mood, energy").gte("entry_date", from),
    fetchAll((a, b) =>
      supabase
        .from("cardio_sessions")
        .select("id, activity_date, activity_type, started_at, duration_min, distance_km, avg_hr, calories, rpe")
        .gte("activity_date", from)
        .order("activity_date")
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("workout_sessions")
        .select(
          "id, session_date, name, template_id, rpe, started_at, created_at, strava_activity_id, workout_sets(weight_kg, reps, exercise_id, exercises(name))",
        )
        .gte("session_date", addDays(today, -365))
        .order("session_date")
        .order("id")
        .range(a, b),
    ),
    supabase.from("profiles").select("height_cm, birth_year, sex, weight_goal").eq("id", user.id).maybeSingle(),
    loadFinance(supabase, from),
  ]);

  const mealRows: RawMeal[] = meals.map((m) => ({
    log_date: m.log_date,
    kcal: Number(m.kcal),
    protein_g: Number(m.protein_g),
    carbs_g: Number(m.carbs_g),
    fat_g: Number(m.fat_g),
    is_free_meal: !!m.is_free_meal,
    eaten_at: m.eaten_at,
  }));
  const weightRows: RawWeight[] = (weights.data ?? []).map((w) => ({
    log_date: w.log_date,
    weight_kg: num(w.weight_kg),
    waist_cm: num(w.waist_cm),
  }));
  const actRows: RawActivity[] = acts.map((a) => ({
    ...a,
    duration_min: Number(a.duration_min),
    distance_km: num(a.distance_km),
    avg_hr: num(a.avg_hr),
    calories: num(a.calories),
  }));
  type SetRow = { weight_kg: number; reps: number; exercise_id: string | null; exercises: { name: string } | { name: string }[] | null };
  const workoutRows: RawWorkout[] = workouts.map((w) => ({
    id: w.id,
    session_date: w.session_date,
    name: w.name,
    template_id: w.template_id,
    rpe: w.rpe,
    started_at: w.started_at,
    created_at: w.created_at,
    strava_activity_id: w.strava_activity_id,
    sets: ((w.workout_sets ?? []) as unknown as SetRow[]).map((s) => ({
      weight_kg: Number(s.weight_kg),
      reps: Number(s.reps),
      exercise_id: s.exercise_id,
      exercise: Array.isArray(s.exercises) ? (s.exercises[0]?.name ?? null) : (s.exercises?.name ?? null),
    })),
  }));

  const yesterday = addDays(today, -1);
  const data = buildDaily({
    from,
    to: yesterday,
    meals: mealRows,
    journal: journal.data ?? [],
    activities: actRows,
    workouts: workoutRows,
    weights: weightRows,
    txs: fin.txs,
    categories: fin.categories,
  });
  const periodFrom = addDays(today, -period);
  const ctx: Ctx = {
    today,
    period,
    periodFrom,
    data,
    rows: data.rows.filter((r) => r.date >= periodFrom),
    meals: mealRows,
    acts: actRows,
    workouts: workoutRows,
    weights: weightRows,
    profile: (profile.data ?? null) as Profile | null,
    href,
    sp: { lag, x: str(sp.x), y: str(sp.y), o: str(sp.o) },
  };

  return (
    <>
      <PageTitle title="Análises" subtitle="O que seus dados dizem sobre você" />

      <nav className="mb-2 grid grid-cols-5 gap-1 rounded-xl border border-line bg-card p-1 text-center text-[12px] font-medium">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href({ v: v.key })}
            className={`rounded-lg py-2 ${view === v.key ? "bg-accent-strong text-white" : "text-muted"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">Período analisado</span>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={href({ p: String(p), x: undefined, y: undefined })}
              className="chip min-h-8 px-2.5 text-xs"
              data-active={period === p}
            >
              {p} dias
            </Link>
          ))}
        </div>
      </div>

      {view === "resumo" && <Resumo ctx={ctx} />}
      {view === "relacoes" && <Relacoes ctx={ctx} />}
      {view === "corpo" && <Corpo ctx={ctx} />}
      {view === "treino" && <Treino ctx={ctx} />}
      {view === "rotina" && <Rotina ctx={ctx} />}
    </>
  );
}
