import { isStrength } from "./activity-types";
import { addDays } from "./dates";

/* =============================================================
 * Estatística básica
 * ============================================================= */

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

/** Correlação de Pearson (−1 a 1). */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx === 0 || dy === 0 ? NaN : num / Math.sqrt(dx * dy);
}

/** Inclinação da reta (mínimos quadrados) de y por x. */
export function slope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return NaN;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? NaN : num / den;
}

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / 86400000);

/* =============================================================
 * Tipos de entrada
 * ============================================================= */

export type Meal = {
  log_date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  is_free_meal: boolean;
  eaten_at: string | null;
};
export type Weight = { log_date: string; weight_kg: number };
export type Journal = { entry_date: string; mood: number | null; energy: number | null };
export type Activity = {
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
export type Workout = {
  id: string;
  session_date: string;
  name: string;
  template_id: string | null;
  rpe: number | null;
  started_at: string | null;
  created_at: string;
  strava_activity_id: string | null;
  volume: number;
};
export type Profile = {
  height_cm: number | null;
  birth_year: number | null;
  sex: "m" | "f" | null;
  weight_goal: "perder" | "manter" | "ganhar" | null;
};

/* =============================================================
 * Dieta por dia
 * ============================================================= */

export type DayDiet = { kcal: number; protein: number; carbs: number; fat: number; free: boolean; meals: number };

export function dietByDay(meals: Meal[]): Map<string, DayDiet> {
  const map = new Map<string, DayDiet>();
  for (const m of meals) {
    const d = map.get(m.log_date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, free: false, meals: 0 };
    d.kcal += m.kcal;
    d.protein += m.protein_g;
    d.carbs += m.carbs_g;
    d.fat += m.fat_g;
    d.free = d.free || m.is_free_meal;
    d.meals += 1;
    map.set(m.log_date, d);
  }
  return map;
}

/* =============================================================
 * Balanço de energia
 * ============================================================= */

export type EnergyBalance = {
  windowDays: number;
  daysLogged: number;
  avgIntake: number | null;
  avgProtein: number | null;
  avgActiveKcal: number;
  weightStart: number | null;
  weightEnd: number | null;
  weightPerWeek: number | null;
  bmr: number | null;
  formulaTdee: number | null;
  adaptiveTdee: number | null;
  tdee: number | null;
  tdeeSource: "dados" | "formula" | null;
  targetKcal: number | null;
  proteinTarget: [number, number] | null;
  missing: string[];
};

/**
 * Estima o gasto calórico diário de dois jeitos:
 *  - "pelos seus dados": consumo médio − variação de peso (7.700 kcal ≈ 1 kg)
 *  - "pela fórmula": Mifflin-St Jeor × 1,2 + calorias médias das atividades (Strava)
 */
export function energyBalance(
  meals: Meal[],
  weights: Weight[],
  activities: Activity[],
  profile: Profile | null,
  today: string,
  windowDays = 28,
): EnergyBalance {
  const from = addDays(today, -windowDays);
  const to = addDays(today, -1); // hoje ainda está em andamento
  const diet = dietByDay(meals.filter((m) => m.log_date >= from && m.log_date <= to && !m.is_free_meal));
  const freeDays = new Set(meals.filter((m) => m.is_free_meal).map((m) => m.log_date));
  const logged = [...diet.entries()].filter(([d, v]) => v.kcal > 300 && !freeDays.has(d));
  const avgIntake = logged.length ? mean(logged.map(([, v]) => v.kcal)) : null;
  const avgProtein = logged.length ? mean(logged.map(([, v]) => v.protein)) : null;

  const acts = activities.filter((a) => a.activity_date >= from && a.activity_date <= to);
  const avgActiveKcal = acts.reduce((s, a) => s + (a.calories ?? 0), 0) / windowDays;

  const w = weights
    .filter((x) => x.log_date >= addDays(today, -windowDays - 7))
    .sort((a, b) => a.log_date.localeCompare(b.log_date));
  const slopePerDay =
    w.length >= 3 && dayNumber(w[w.length - 1].log_date) - dayNumber(w[0].log_date) >= 10
      ? slope(w.map((x) => ({ x: dayNumber(x.log_date), y: x.weight_kg })))
      : NaN;
  const weightPerWeek = Number.isFinite(slopePerDay) ? slopePerDay * 7 : null;
  const weightEnd = weights.length
    ? [...weights].sort((a, b) => a.log_date.localeCompare(b.log_date)).at(-1)!.weight_kg
    : null;

  let bmr: number | null = null;
  if (profile?.height_cm && profile.birth_year && profile.sex && weightEnd) {
    const age = Number(today.slice(0, 4)) - profile.birth_year;
    bmr = 10 * weightEnd + 6.25 * profile.height_cm - 5 * age + (profile.sex === "m" ? 5 : -161);
  }
  const formulaTdee = bmr ? bmr * 1.2 + avgActiveKcal : null;
  const adaptiveTdee =
    avgIntake != null && logged.length >= 10 && weightPerWeek != null ? avgIntake - (slopePerDay * 7700) : null;

  const tdee = adaptiveTdee ?? formulaTdee;
  const goal = profile?.weight_goal ?? "manter";
  const targetKcal = tdee == null ? null : goal === "perder" ? tdee - 500 : goal === "ganhar" ? tdee + 300 : tdee;
  const proteinTarget: [number, number] | null = weightEnd ? [weightEnd * 1.6, weightEnd * 2.2] : null;

  const missing: string[] = [];
  if (logged.length < 10) missing.push(`registrar a dieta em pelo menos 10 dias (hoje: ${logged.length})`);
  if (w.length < 3) missing.push("registrar o peso pelo menos 3 vezes em 2 semanas (aba Fotos)");
  if (!bmr) missing.push("preencher altura, ano de nascimento e sexo em Configurações");

  return {
    windowDays,
    daysLogged: logged.length,
    avgIntake,
    avgProtein,
    avgActiveKcal,
    weightStart: w[0]?.weight_kg ?? null,
    weightEnd,
    weightPerWeek,
    bmr,
    formulaTdee,
    adaptiveTdee,
    tdee,
    tdeeSource: adaptiveTdee != null ? "dados" : formulaTdee != null ? "formula" : null,
    targetKcal,
    proteinTarget,
    missing,
  };
}

/* =============================================================
 * Desempenho × fatores (dia anterior, humor, descanso, refeição)
 * ============================================================= */

export type PerfPoint = {
  date: string;
  kind: "forca" | "corrida";
  label: string;
  /** desempenho relativo à sua média (100 = na média) */
  score: number;
  startedAt: string | null;
  rpe: number | null;
};

/** Força: volume do treino comparado com a média do mesmo modelo (ou mesmo nome). */
export function strengthPerformance(workouts: Workout[]): PerfPoint[] {
  const groups = new Map<string, Workout[]>();
  for (const w of workouts.filter((x) => x.volume > 0)) {
    const key = w.template_id ?? w.name.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  const out: PerfPoint[] = [];
  groups.forEach((list) => {
    if (list.length < 2) return;
    const avg = mean(list.map((w) => w.volume));
    for (const w of list) {
      out.push({
        date: w.session_date,
        kind: "forca",
        label: w.name,
        score: (w.volume / avg) * 100,
        startedAt: w.started_at ?? w.created_at,
        rpe: w.rpe,
      });
    }
  });
  return out;
}

/** Corrida: velocidade média comparada com a sua média de corridas. */
export function runPerformance(activities: Activity[]): PerfPoint[] {
  const runs = activities.filter(
    (a) => ["Run", "TrailRun", "VirtualRun"].includes(a.activity_type) && a.distance_km && a.distance_km > 1 && a.duration_min > 0,
  );
  if (runs.length < 2) return [];
  const speed = (a: Activity) => (a.distance_km as number) / a.duration_min;
  const avg = mean(runs.map(speed));
  return runs.map((a) => ({
    date: a.activity_date,
    kind: "corrida" as const,
    label: "Corrida",
    score: (speed(a) / avg) * 100,
    startedAt: a.started_at,
    rpe: a.rpe,
  }));
}

export type Factor = {
  key: string;
  label: string;
  unit: string;
  value: (p: PerfPoint) => number | null;
};

export type Correlation = {
  metric: string;
  factor: Factor;
  r: number;
  n: number;
  points: { x: number; y: number }[];
};

/** Horas entre a última refeição registrada (com horário) e o início do treino. */
function hoursSinceMeal(p: PerfPoint, meals: Meal[]): number | null {
  if (!p.startedAt) return null;
  const start = new Date(p.startedAt);
  const localStart = new Date(start.getTime() - 3 * 3600_000); // São Paulo (UTC−3)
  const startMin = localStart.getUTCHours() * 60 + localStart.getUTCMinutes();
  const candidates = meals
    .filter((m) => m.eaten_at && (m.log_date === p.date || m.log_date === addDays(p.date, -1)))
    .map((m) => {
      const [h, mi] = (m.eaten_at as string).split(":").map(Number);
      const minutes = h * 60 + mi - (m.log_date === p.date ? 0 : 1440);
      return startMin - minutes;
    })
    .filter((diff) => diff >= 0 && diff <= 16 * 60);
  return candidates.length ? Math.min(...candidates) / 60 : null;
}

export function buildFactors(meals: Meal[], journal: Journal[], allTrainingDates: string[]): Factor[] {
  const diet = dietByDay(meals);
  const mood = new Map(journal.map((j) => [j.entry_date, j]));
  const trainingDays = [...new Set(allTrainingDates)].sort();
  const prev = (d: string) => addDays(d, -1);
  const dietPrev = (p: PerfPoint) => {
    const d = diet.get(prev(p.date));
    return d && d.kcal > 300 ? d : null;
  };

  return [
    { key: "kcal_prev", label: "Calorias no dia anterior", unit: "kcal", value: (p) => dietPrev(p)?.kcal ?? null },
    { key: "protein_prev", label: "Proteína no dia anterior", unit: "g", value: (p) => dietPrev(p)?.protein ?? null },
    { key: "carbs_prev", label: "Carboidrato no dia anterior", unit: "g", value: (p) => dietPrev(p)?.carbs ?? null },
    {
      key: "free_prev",
      label: "Refeição livre no dia anterior",
      unit: "sim/não",
      value: (p) => (diet.has(prev(p.date)) ? (diet.get(prev(p.date))!.free ? 1 : 0) : null),
    },
    { key: "mood_prev", label: "Humor no dia anterior", unit: "1–5", value: (p) => mood.get(prev(p.date))?.mood ?? null },
    { key: "energy_prev", label: "Energia no dia anterior", unit: "1–5", value: (p) => mood.get(prev(p.date))?.energy ?? null },
    { key: "mood_same", label: "Humor no dia", unit: "1–5", value: (p) => mood.get(p.date)?.mood ?? null },
    { key: "energy_same", label: "Energia no dia", unit: "1–5", value: (p) => mood.get(p.date)?.energy ?? null },
    {
      key: "rest_days",
      label: "Dias de descanso antes",
      unit: "dias",
      value: (p) => {
        const before = trainingDays.filter((d) => d < p.date);
        if (!before.length) return null;
        return dayNumber(p.date) - dayNumber(before[before.length - 1]) - 1;
      },
    },
    { key: "meal_gap", label: "Horas desde a última refeição", unit: "h", value: (p) => hoursSinceMeal(p, meals) },
  ];
}

export function correlate(points: PerfPoint[], factors: Factor[], metric: string, minN = 6): Correlation[] {
  const out: Correlation[] = [];
  for (const f of factors) {
    const pairs = points
      .map((p) => ({ x: f.value(p), y: p.score }))
      .filter((q): q is { x: number; y: number } => q.x != null && Number.isFinite(q.x));
    if (pairs.length < minN) continue;
    const r = pearson(
      pairs.map((q) => q.x),
      pairs.map((q) => q.y),
    );
    if (!Number.isFinite(r)) continue;
    out.push({ metric, factor: f, r, n: pairs.length, points: pairs });
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

export function strengthWord(r: number) {
  const a = Math.abs(r);
  if (a < 0.2) return "quase nenhuma";
  if (a < 0.4) return "fraca";
  if (a < 0.6) return "moderada";
  return "forte";
}

/** Frase simples para uma correlação. */
export function explain(c: Correlation): string {
  const up = c.r > 0;
  const perf = c.metric === "forca" ? "o volume do treino" : "o ritmo da corrida";
  if (c.factor.unit === "sim/não") {
    return `Depois de refeição livre, ${perf} tende a ${up ? "subir" : "cair"}.`;
  }
  return `Quanto mais alto esse fator, mais ${perf} tende a ${up ? "subir" : "cair"}.`;
}

/* =============================================================
 * Humor × hábitos
 * ============================================================= */

export function moodByTraining(journal: Journal[], trainingDates: string[]) {
  const trained = new Set(trainingDates);
  const withMood = journal.filter((j) => j.mood != null);
  const on = withMood.filter((j) => trained.has(j.entry_date)).map((j) => j.mood as number);
  const off = withMood.filter((j) => !trained.has(j.entry_date)).map((j) => j.mood as number);
  return {
    trainedAvg: on.length ? mean(on) : null,
    restAvg: off.length ? mean(off) : null,
    trainedN: on.length,
    restN: off.length,
  };
}

/* =============================================================
 * Consistência (grade de 12 semanas)
 * ============================================================= */

export function consistencyGrid(today: string, activeDates: Set<string>, weeks = 12) {
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
  const lastMonday = addDays(today, wd === 0 ? -6 : 1 - wd);
  const start = addDays(lastMonday, -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, w * 7 + d);
      return { date, active: activeDates.has(date), future: date > today };
    }),
  );
}

export const isStrengthActivity = (a: Activity) => isStrength(a.activity_type);
