import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, daysInMonth, startOfMonth, startOfWeek, todayISO } from "./dates";

export type MetricKey =
  | "treinos"
  | "cardio_sessoes"
  | "cardio_minutos"
  | "cardio_km"
  | "kcal_media"
  | "proteina_media"
  | "carbo_media"
  | "gordura_media"
  | "refeicoes_livres"
  | "diario_dias"
  | "fotos_dias"
  | "peso";

export type Period = "day" | "week" | "month";
export type Direction = "gte" | "lte";
export type Status = "green" | "yellow" | "red" | "none";

type MetricDef = {
  label: string;
  unit: string;
  /** sum = acumula no período; avg = média por dia com registro; latest = último valor */
  kind: "sum" | "avg" | "latest";
  decimals: number;
};

export const METRICS: Record<MetricKey, MetricDef> = {
  treinos: { label: "Treinos de musculação", unit: "treinos", kind: "sum", decimals: 0 },
  cardio_sessoes: { label: "Sessões de cardio", unit: "sessões", kind: "sum", decimals: 0 },
  cardio_minutos: { label: "Minutos de cardio", unit: "min", kind: "sum", decimals: 0 },
  cardio_km: { label: "Distância de cardio", unit: "km", kind: "sum", decimals: 1 },
  kcal_media: { label: "Calorias por dia", unit: "kcal", kind: "avg", decimals: 0 },
  proteina_media: { label: "Proteína por dia", unit: "g", kind: "avg", decimals: 0 },
  carbo_media: { label: "Carboidrato por dia", unit: "g", kind: "avg", decimals: 0 },
  gordura_media: { label: "Gordura por dia", unit: "g", kind: "avg", decimals: 0 },
  refeicoes_livres: { label: "Refeições livres", unit: "refeições", kind: "sum", decimals: 0 },
  diario_dias: { label: "Dias com diário", unit: "dias", kind: "sum", decimals: 0 },
  fotos_dias: { label: "Dias com foto", unit: "dias", kind: "sum", decimals: 0 },
  peso: { label: "Peso", unit: "kg", kind: "latest", decimals: 1 },
};

export const PERIOD_LABELS: Record<Period, string> = {
  day: "por dia",
  week: "por semana",
  month: "por mês",
};

export type Goal = {
  id: string;
  metric: MetricKey;
  target: number;
  period: Period;
  direction: Direction;
  active: boolean;
  position: number;
};

export type GoalData = {
  workouts: { session_date: string }[];
  cardio: { activity_date: string; duration_min: number; distance_km: number | null }[];
  meals: {
    log_date: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    is_free_meal: boolean;
  }[];
  journal: { entry_date: string; content: string }[];
  bodyPhotos: { log_date: string }[];
  latestWeight: number | null;
};

export type GoalProgress = Goal & {
  value: number | null;
  status: Status;
  pct: number;
  hint: string;
};

export function periodRange(period: Period, today: string) {
  if (period === "day") return { from: today, to: today, elapsed: 1, total: 1 };
  if (period === "week") {
    const from = startOfWeek(today);
    const elapsed = Math.round((Date.parse(today) - Date.parse(from)) / 86400000) + 1;
    return { from, to: today, elapsed, total: 7 };
  }
  const from = startOfMonth(today);
  return { from, to: today, elapsed: Number(today.slice(8, 10)), total: daysInMonth(today) };
}

/** Busca, de uma vez, tudo que as metas precisam desde a data mais antiga usada. */
export async function fetchGoalData(supabase: SupabaseClient, today = todayISO()): Promise<GoalData> {
  const from = [startOfWeek(today), startOfMonth(today)].sort()[0];
  const [workouts, cardio, meals, journal, photos, weight] = await Promise.all([
    supabase.from("workout_sessions").select("session_date").gte("session_date", from).lte("session_date", today),
    supabase
      .from("cardio_sessions")
      .select("activity_date, duration_min, distance_km")
      .gte("activity_date", from)
      .lte("activity_date", today),
    supabase
      .from("meal_logs")
      .select("log_date, kcal, protein_g, carbs_g, fat_g, is_free_meal")
      .gte("log_date", from)
      .lte("log_date", today),
    supabase.from("journal_entries").select("entry_date, content").gte("entry_date", from).lte("entry_date", today),
    supabase
      .from("body_logs")
      .select("log_date")
      .not("photo_path", "is", null)
      .gte("log_date", from)
      .lte("log_date", today),
    supabase
      .from("body_logs")
      .select("weight_kg")
      .not("weight_kg", "is", null)
      .lte("log_date", today)
      .order("log_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const num = (v: unknown) => Number(v ?? 0);
  return {
    workouts: workouts.data ?? [],
    cardio: (cardio.data ?? []).map((c) => ({
      activity_date: c.activity_date,
      duration_min: num(c.duration_min),
      distance_km: c.distance_km == null ? null : num(c.distance_km),
    })),
    meals: (meals.data ?? []).map((m) => ({
      log_date: m.log_date,
      kcal: num(m.kcal),
      protein_g: num(m.protein_g),
      carbs_g: num(m.carbs_g),
      fat_g: num(m.fat_g),
      is_free_meal: m.is_free_meal,
    })),
    journal: journal.data ?? [],
    bodyPhotos: photos.data ?? [],
    latestWeight: weight.data?.weight_kg == null ? null : num(weight.data.weight_kg),
  };
}

function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

/**
 * Média diária considerando só os dias com registro.
 * Em semana/mês, o dia de hoje (ainda incompleto) fica de fora quando já existe dia anterior com registro.
 */
function dailyAverage(
  meals: GoalData["meals"],
  from: string,
  to: string,
  field: "kcal" | "protein_g" | "carbs_g" | "fat_g",
): number | null {
  if (from < to) {
    const closed = dayAverage(meals, from, addDays(to, -1), field);
    if (closed != null) return closed;
  }
  return dayAverage(meals, from, to, field);
}

function dayAverage(
  meals: GoalData["meals"],
  from: string,
  to: string,
  field: "kcal" | "protein_g" | "carbs_g" | "fat_g",
): number | null {
  const byDay = new Map<string, number>();
  for (const m of meals) {
    if (!inRange(m.log_date, from, to)) continue;
    byDay.set(m.log_date, (byDay.get(m.log_date) ?? 0) + m[field]);
  }
  if (byDay.size === 0) return null;
  let total = 0;
  byDay.forEach((v) => (total += v));
  return total / byDay.size;
}

export function metricValue(metric: MetricKey, data: GoalData, from: string, to: string): number | null {
  const r = (d: string) => inRange(d, from, to);
  switch (metric) {
    case "treinos":
      return data.workouts.filter((w) => r(w.session_date)).length;
    case "cardio_sessoes":
      return data.cardio.filter((c) => r(c.activity_date)).length;
    case "cardio_minutos":
      return data.cardio.filter((c) => r(c.activity_date)).reduce((s, c) => s + c.duration_min, 0);
    case "cardio_km":
      return data.cardio.filter((c) => r(c.activity_date)).reduce((s, c) => s + (c.distance_km ?? 0), 0);
    case "kcal_media":
      return dailyAverage(data.meals, from, to, "kcal");
    case "proteina_media":
      return dailyAverage(data.meals, from, to, "protein_g");
    case "carbo_media":
      return dailyAverage(data.meals, from, to, "carbs_g");
    case "gordura_media":
      return dailyAverage(data.meals, from, to, "fat_g");
    case "refeicoes_livres":
      return data.meals.filter((m) => m.is_free_meal && r(m.log_date)).length;
    case "diario_dias":
      return new Set(data.journal.filter((j) => j.content.trim() && r(j.entry_date)).map((j) => j.entry_date)).size;
    case "fotos_dias":
      return new Set(data.bodyPhotos.filter((p) => r(p.log_date)).map((p) => p.log_date)).size;
    case "peso":
      return data.latestWeight;
  }
}

export function formatValue(metric: MetricKey, value: number | null): string {
  if (value == null) return "–";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: METRICS[metric].decimals });
}

/** Semáforo: verde (ok) → amarelo (atenção) → vermelho (fora). */
export function evaluateGoal(goal: Goal, data: GoalData, today = todayISO()): GoalProgress {
  const def = METRICS[goal.metric];
  const range = periodRange(goal.period, today);
  const value = metricValue(goal.metric, data, range.from, range.to);
  const target = Number(goal.target);
  const pct = value == null || target <= 0 ? 0 : Math.min(value / target, 1);

  let status: Status = "none";
  let hint = "";

  if (value == null) {
    hint = "Sem registros no período";
  } else if (def.kind === "sum" && goal.direction === "gte") {
    // Ritmo esperado considerando só os dias já encerrados (hoje ainda está em andamento)
    const expected = (target * (range.elapsed - 1)) / range.total;
    if (value >= target) status = "green";
    else if (value >= expected) status = "green";
    else if (value >= expected * 0.6) status = "yellow";
    else status = "red";
    const missing = Math.max(target - value, 0);
    hint = missing > 0 ? `Faltam ${formatValue(goal.metric, missing)} ${def.unit}` : "Meta batida";
  } else if (goal.direction === "lte") {
    const tolerance = def.kind === "sum" ? 0.9 : def.kind === "avg" ? 1.1 : 1.03;
    if (value > target * (def.kind === "sum" ? 1 : tolerance)) status = "red";
    else if (def.kind === "sum" ? value >= target * tolerance : value > target) status = "yellow";
    else status = "green";
    hint = value > target ? "Acima do limite" : def.kind === "sum" ? `Limite: ${formatValue(goal.metric, target)}` : "Dentro do limite";
  } else {
    const tolerance = def.kind === "avg" ? 0.85 : 0.97;
    if (value >= target) status = "green";
    else if (value >= target * tolerance) status = "yellow";
    else status = "red";
    hint = value >= target ? "Meta batida" : `Faltam ${formatValue(goal.metric, target - value)} ${def.unit}`;
  }

  return { ...goal, target, value, status, pct, hint };
}

/** Metas diárias de dieta (para as barras da aba Dieta). */
export function dailyNutritionTargets(goals: Goal[]) {
  const pick = (m: MetricKey) => goals.find((g) => g.active && g.metric === m);
  return {
    kcal: pick("kcal_media"),
    protein: pick("proteina_media"),
    carbs: pick("carbo_media"),
    fat: pick("gordura_media"),
  };
}
