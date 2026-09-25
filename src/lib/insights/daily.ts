import { isStrength } from "@/lib/activity-types";
import { addDays } from "@/lib/dates";
import { mean } from "@/lib/stats";

/* =============================================================
 * Uma linha por dia com tudo que foi registrado.
 * É a base de todas as análises (relações, rotina, tendências).
 * ============================================================= */

export type RawMeal = {
  log_date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  is_free_meal: boolean;
  eaten_at: string | null;
};
export type RawJournal = { entry_date: string; mood: number | null; energy: number | null };
export type RawActivity = {
  id: string;
  activity_date: string;
  activity_type: string;
  started_at: string | null;
  duration_min: number;
  distance_km: number | null;
  avg_hr: number | null;
  calories: number | null;
  rpe: number | null;
};
export type RawSet = { weight_kg: number; reps: number; exercise_id: string | null; exercise: string | null };
export type RawWorkout = {
  id: string;
  session_date: string;
  name: string;
  template_id: string | null;
  rpe: number | null;
  started_at: string | null;
  created_at: string;
  strava_activity_id: string | null;
  sets: RawSet[];
};
export type RawWeight = { log_date: string; weight_kg: number | null; waist_cm: number | null };
export type RawTx = { tx_date: string; amount: number; category_id: string | null };
export type RawCategory = { id: string; name: string; kind: "despesa" | "receita" | "neutro" };

export type DayRow = {
  date: string;
  weekday: number; // 0 = segunda … 6 = domingo
  // dieta
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  freeMeal: number | null;
  firstMeal: number | null; // hora decimal
  lastMeal: number | null;
  // treino
  strength: number | null; // 1 = treinou força
  cardioMin: number | null;
  activeKcal: number | null;
  trainRpe: number | null;
  strengthScore: number | null; // volume vs média do mesmo treino (100 = média)
  runScore: number | null; // velocidade vs média (100 = média)
  active: number | null; // qualquer treino
  restBefore: number | null; // dias sem treino antes deste dia (até 7)
  // cabeça
  mood: number | null;
  energy: number | null;
  // corpo
  weight: number | null;
  waist: number | null;
  // dinheiro
  spend: number | null;
  cat: Record<string, number>; // gasto por categoria (só dias com finanças)
};

export type DailyData = {
  rows: DayRow[];
  byDate: Map<string, DayRow>;
  /** primeiro dia com algum dado de cada módulo */
  starts: { diet: string | null; train: string | null; mood: string | null; money: string | null; weight: string | null };
  expenseCats: RawCategory[];
};

const hourOf = (hhmm: string | null) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) ? h + (m || 0) / 60 : null;
};

/** Hora local (São Paulo, UTC−3) de um timestamp. */
export function localHour(ts: string | null) {
  if (!ts) return null;
  const d = new Date(new Date(ts).getTime() - 3 * 3600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

export const weekdayOf = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 0 ? 6 : d - 1;
};

export const workoutVolume = (w: RawWorkout) => w.sets.reduce((s, x) => s + x.weight_kg * x.reps, 0);

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
export const isRun = (a: RawActivity) => RUN_TYPES.has(a.activity_type) && (a.distance_km ?? 0) > 1 && a.duration_min > 0;

export function buildDaily(input: {
  from: string;
  to: string;
  meals: RawMeal[];
  journal: RawJournal[];
  activities: RawActivity[];
  workouts: RawWorkout[];
  weights: RawWeight[];
  txs: RawTx[];
  categories: RawCategory[];
}): DailyData {
  const { from, to } = input;
  const first = (dates: string[]) => (dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null);

  // ---------- dieta
  const diet = new Map<string, { kcal: number; p: number; c: number; f: number; free: boolean; hours: number[] }>();
  for (const m of input.meals) {
    const d = diet.get(m.log_date) ?? { kcal: 0, p: 0, c: 0, f: 0, free: false, hours: [] };
    d.kcal += m.kcal;
    d.p += m.protein_g;
    d.c += m.carbs_g;
    d.f += m.fat_g;
    d.free ||= m.is_free_meal;
    const h = hourOf(m.eaten_at);
    if (h != null) d.hours.push(h);
    diet.set(m.log_date, d);
  }

  // ---------- desempenho (força: volume vs média do mesmo treino)
  const strengthScore = new Map<string, number>();
  const groups = new Map<string, RawWorkout[]>();
  for (const w of input.workouts) {
    if (workoutVolume(w) <= 0) continue;
    const key = w.template_id ?? w.name.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  groups.forEach((list) => {
    if (list.length < 2) return;
    const avg = mean(list.map(workoutVolume));
    for (const w of list) {
      const s = (workoutVolume(w) / avg) * 100;
      strengthScore.set(w.session_date, Math.max(strengthScore.get(w.session_date) ?? 0, s));
    }
  });
  const runs = input.activities.filter(isRun);
  const runAvg = mean(runs.map((a) => (a.distance_km as number) / a.duration_min));
  const runScore = new Map<string, number>();
  if (runs.length >= 2) {
    for (const a of runs) runScore.set(a.activity_date, (((a.distance_km as number) / a.duration_min) / runAvg) * 100);
  }

  // ---------- treino por dia
  const strengthDays = new Set([
    ...input.workouts.map((w) => w.session_date),
    ...input.activities.filter((a) => isStrength(a.activity_type)).map((a) => a.activity_date),
  ]);
  const cardio = new Map<string, number>();
  const activeKcal = new Map<string, number>();
  const rpe = new Map<string, number>();
  for (const a of input.activities) {
    if (!isStrength(a.activity_type)) cardio.set(a.activity_date, (cardio.get(a.activity_date) ?? 0) + a.duration_min);
    if (a.calories) activeKcal.set(a.activity_date, (activeKcal.get(a.activity_date) ?? 0) + a.calories);
    if (a.rpe) rpe.set(a.activity_date, Math.max(rpe.get(a.activity_date) ?? 0, a.rpe));
  }
  for (const w of input.workouts) if (w.rpe) rpe.set(w.session_date, Math.max(rpe.get(w.session_date) ?? 0, w.rpe));

  // ---------- humor, peso
  const journal = new Map(input.journal.map((j) => [j.entry_date, j]));
  const weights = new Map(input.weights.map((w) => [w.log_date, w]));

  // ---------- dinheiro
  const kind = new Map(input.categories.map((c) => [c.id, c.kind]));
  const spend = new Map<string, number>();
  const catSpend = new Map<string, Record<string, number>>();
  for (const t of input.txs) {
    const k = t.category_id ? kind.get(t.category_id) : t.amount < 0 ? "despesa" : "receita";
    if (k !== "despesa") continue;
    const v = -t.amount;
    spend.set(t.tx_date, (spend.get(t.tx_date) ?? 0) + v);
    if (t.category_id) {
      const rec = catSpend.get(t.tx_date) ?? {};
      rec[t.category_id] = (rec[t.category_id] ?? 0) + v;
      catSpend.set(t.tx_date, rec);
    }
  }

  const starts = {
    diet: first([...diet.keys()]),
    train: first([...strengthDays, ...input.activities.map((a) => a.activity_date)]),
    mood: first(input.journal.filter((j) => j.mood != null || j.energy != null).map((j) => j.entry_date)),
    money: first(input.txs.map((t) => t.tx_date)),
    weight: first(input.weights.map((w) => w.log_date)),
  };

  const rows: DayRow[] = [];
  const byDate = new Map<string, DayRow>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dd = diet.get(d);
    const logged = !!dd && dd.kcal > 300;
    const trainKnown = starts.train != null && d >= starts.train;
    const moneyKnown = starts.money != null && d >= starts.money;
    const j = journal.get(d);
    const w = weights.get(d);
    const hasStrength = strengthDays.has(d);
    const hasCardio = (cardio.get(d) ?? 0) > 0;
    const row: DayRow = {
      date: d,
      weekday: weekdayOf(d),
      kcal: logged && !dd!.free ? dd!.kcal : null,
      protein: logged && !dd!.free ? dd!.p : null,
      carbs: logged && !dd!.free ? dd!.c : null,
      fat: logged && !dd!.free ? dd!.f : null,
      freeMeal: dd ? (dd.free ? 1 : 0) : null,
      firstMeal: dd && dd.hours.length ? Math.min(...dd.hours) : null,
      lastMeal: dd && dd.hours.length ? Math.max(...dd.hours) : null,
      strength: trainKnown ? (hasStrength ? 1 : 0) : null,
      cardioMin: trainKnown ? (cardio.get(d) ?? 0) : null,
      activeKcal: trainKnown ? (activeKcal.get(d) ?? 0) : null,
      trainRpe: rpe.get(d) ?? null,
      strengthScore: strengthScore.get(d) ?? null,
      runScore: runScore.get(d) ?? null,
      active: trainKnown ? (hasStrength || hasCardio ? 1 : 0) : null,
      restBefore: null,
      mood: j?.mood ?? null,
      energy: j?.energy ?? null,
      weight: w?.weight_kg ?? null,
      waist: w?.waist_cm ?? null,
      spend: moneyKnown ? (spend.get(d) ?? 0) : null,
      cat: moneyKnown ? (catSpend.get(d) ?? {}) : {},
    };
    rows.push(row);
    byDate.set(d, row);
  }

  // dias de descanso antes de cada dia (olhando também antes do período)
  const activeDays = [...new Set([...strengthDays, ...[...cardio.keys()]])].sort();
  for (const r of rows) {
    if (r.active == null) continue;
    let lo = 0;
    let hi = activeDays.length - 1;
    let last: string | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (activeDays[mid] < r.date) {
        last = activeDays[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (last) {
      const gap = Math.round((Date.parse(`${r.date}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86400000) - 1;
      r.restBefore = Math.min(7, gap);
    }
  }

  return { rows, byDate, starts, expenseCats: input.categories.filter((c) => c.kind === "despesa") };
}
