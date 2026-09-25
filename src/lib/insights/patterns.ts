import { isStrength } from "@/lib/activity-types";
import { addDays } from "@/lib/dates";
import { ewma, isNum, linreg, mean, rolling } from "@/lib/stats";
import { isRun, localHour, type DailyData, type DayRow, type RawActivity, type RawMeal, type RawWorkout, workoutVolume } from "./daily";

export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/* ------------------------------------------------------------- tendências (7 dias × 4 semanas antes) */

export type Trend = {
  key: string;
  label: string;
  unit: string;
  now: number | null;
  before: number | null;
  delta: number | null;
  better: 1 | -1 | 0;
  series: (number | null)[];
  digits: number;
};

export function trends(data: DailyData, today: string): Trend[] {
  const last = addDays(today, -1);
  const rowsIn = (from: string, to: string) => data.rows.filter((r) => r.date >= from && r.date <= to);
  const recent = rowsIn(addDays(last, -6), last);
  const prior = rowsIn(addDays(last, -34), addDays(last, -7));
  const window = rowsIn(addDays(last, -59), last);

  const avg = (rs: DayRow[], f: (r: DayRow) => number | null) => {
    const v = rs.map(f).filter(isNum);
    return v.length ? mean(v) : null;
  };
  const weekly = (rs: DayRow[], f: (r: DayRow) => number | null) => {
    const v = rs.map(f).filter(isNum);
    return v.length >= 4 ? (v.reduce((s, x) => s + x, 0) / v.length) * 7 : null;
  };

  const mk = (
    key: string,
    label: string,
    unit: string,
    f: (r: DayRow) => number | null,
    better: 1 | -1 | 0,
    digits = 0,
    mode: "avg" | "week" = "avg",
  ): Trend => {
    const agg = mode === "week" ? weekly : avg;
    const now = agg(recent, f);
    const before = agg(prior, f);
    const seriesRaw = window.map(f);
    const series = mode === "week" ? rolling(seriesRaw, 7, 4).map((v) => (v == null ? null : v * 7)) : rolling(seriesRaw, 7);
    return { key, label, unit, now, before, delta: now != null && before != null ? now - before : null, better, series, digits };
  };

  // Peso: média exponencial (tira o efeito da água)
  const wSeries = ewma(window.map((r) => r.weight), 0.15);
  const wNow = [...wSeries].reverse().find(isNum) ?? null;
  const wBefore = wSeries[Math.max(0, wSeries.length - 29)] ?? null;

  return [
    mk("mood", "Humor", "/5", (r) => r.mood, 1, 1),
    mk("energy", "Energia", "/5", (r) => r.energy, 1, 1),
    mk("active", "Dias ativos", "/sem", (r) => r.active, 1, 1, "week"),
    mk("protein", "Proteína", "g/dia", (r) => r.protein, 1),
    mk("kcal", "Calorias", "kcal/dia", (r) => r.kcal, 0),
    mk("spend", "Gasto", "R$/dia", (r) => r.spend, -1),
    {
      key: "weight",
      label: "Peso (tendência)",
      unit: "kg",
      now: wNow,
      before: wNow != null && wBefore != null ? wBefore : null,
      delta: wNow != null && wBefore != null ? wNow - wBefore : null,
      better: 0,
      series: wSeries,
      digits: 1,
    },
  ];
}

/* ------------------------------------------------------------- semana típica */

export type WeekdayMetric = { key: string; label: string; fmt: (v: number) => string; values: (number | null)[]; n: number[] };

export function weekdayProfile(rows: DayRow[]): WeekdayMetric[] {
  const f0 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const f1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const defs: [string, string, (r: DayRow) => number | null, (v: number) => string][] = [
    ["mood", "Humor", (r) => r.mood, f1],
    ["energy", "Energia", (r) => r.energy, f1],
    ["active", "Treinou", (r) => r.active, (v) => `${f0(v * 100)}%`],
    ["kcal", "Calorias", (r) => r.kcal, f0],
    ["protein", "Proteína (g)", (r) => r.protein, f0],
    ["spend", "Gasto (R$)", (r) => r.spend, f0],
  ];
  return defs
    .map(([key, label, get, fmt]) => {
      const values: (number | null)[] = [];
      const n: number[] = [];
      for (let d = 0; d < 7; d++) {
        const v = rows.filter((r) => r.weekday === d).map(get).filter(isNum);
        values.push(v.length >= 2 ? mean(v) : null);
        n.push(v.length);
      }
      return { key, label, fmt, values, n };
    })
    .filter((m) => m.values.filter(isNum).length >= 4);
}

/* ------------------------------------------------------------- dieta */

export function mealTiming(meals: RawMeal[], from: string) {
  const hist = Array.from({ length: 24 }, () => 0);
  const byDay = new Map<string, number[]>();
  for (const m of meals) {
    if (m.log_date < from || !m.eaten_at) continue;
    const [h, mi] = m.eaten_at.split(":").map(Number);
    if (!Number.isFinite(h)) continue;
    hist[h] += 1;
    byDay.set(m.log_date, [...(byDay.get(m.log_date) ?? []), h + (mi || 0) / 60]);
  }
  const days = [...byDay.values()].filter((v) => v.length >= 2);
  return {
    hist,
    total: hist.reduce((s, x) => s + x, 0),
    first: days.length ? mean(days.map((v) => Math.min(...v))) : null,
    last: days.length ? mean(days.map((v) => Math.max(...v))) : null,
    window: days.length ? mean(days.map((v) => Math.max(...v) - Math.min(...v))) : null,
    days: days.length,
  };
}

export function macroSplit(rows: DayRow[]) {
  const d = rows.filter((r) => r.kcal != null && r.protein != null);
  if (d.length < 3) return null;
  const p = mean(d.map((r) => r.protein as number)) * 4;
  const c = mean(d.map((r) => r.carbs as number)) * 4;
  const f = mean(d.map((r) => r.fat as number)) * 9;
  const t = p + c + f || 1;
  return { protein: p / t, carbs: c / t, fat: f / t, days: d.length };
}

/* ------------------------------------------------------------- treino */

export function weeklyLoad(data: DailyData, activities: RawActivity[], workouts: RawWorkout[], today: string, weeks = 12) {
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, wd === 0 ? -6 : 1 - wd);
  const out: { week: string; strength: number; cardio: number; cardioMin: number; kcal: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(monday, -7 * i);
    const end = addDays(start, 6);
    const inW = (d: string) => d >= start && d <= end;
    const strengthDays = new Set([
      ...workouts.filter((w) => inW(w.session_date)).map((w) => w.session_date),
      ...activities.filter((a) => inW(a.activity_date) && isStrength(a.activity_type)).map((a) => a.activity_date),
    ]);
    const cardio = activities.filter((a) => inW(a.activity_date) && !isStrength(a.activity_type));
    out.push({
      week: start,
      strength: strengthDays.size,
      cardio: cardio.length,
      cardioMin: cardio.reduce((s, a) => s + a.duration_min, 0),
      kcal: activities.filter((a) => inW(a.activity_date)).reduce((s, a) => s + (a.calories ?? 0), 0),
    });
  }
  return out;
}

export function streaks(data: DailyData, today: string) {
  const active = new Set(data.rows.filter((r) => r.active === 1).map((r) => r.date));
  // semanas seguidas com 3+ dias ativos
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, wd === 0 ? -6 : 1 - wd);
  const weekCount = (i: number) => {
    const s = addDays(monday, -7 * i);
    let n = 0;
    for (let k = 0; k < 7; k++) if (active.has(addDays(s, k))) n++;
    return n;
  };
  let weeks = 0;
  for (let i = 1; i < 60; i++) {
    if (weekCount(i) >= 3) weeks++;
    else break;
  }
  if (weekCount(0) >= 3) weeks++;
  // maior sequência de dias sem ficar 2 dias parado
  let best = 0;
  let cur = 0;
  let gap = 0;
  for (const r of data.rows) {
    if (r.active == null) continue;
    if (r.active) {
      cur += 1 + gap;
      gap = 0;
    } else {
      gap++;
      if (gap >= 2) {
        best = Math.max(best, cur);
        cur = 0;
        gap = 0;
      }
    }
  }
  best = Math.max(best, cur);
  return { weeks, thisWeek: weekCount(0), best };
}

/** Desempenho por horário do treino (manhã / tarde / noite). */
export function byTimeOfDay(data: DailyData, activities: RawActivity[], workouts: RawWorkout[]) {
  const bucket = (h: number | null) => (h == null ? null : h < 12 ? 0 : h < 18 ? 1 : 2);
  const names = ["Manhã", "Tarde", "Noite"];
  const res = names.map((name) => ({ name, strength: [] as number[], run: [] as number[] }));
  for (const w of workouts) {
    const b = bucket(localHour(w.started_at ?? w.created_at));
    const s = data.byDate.get(w.session_date)?.strengthScore;
    if (b != null && isNum(s)) res[b].strength.push(s);
  }
  for (const a of activities.filter(isRun)) {
    const b = bucket(localHour(a.started_at));
    const s = data.byDate.get(a.activity_date)?.runScore;
    if (b != null && isNum(s)) res[b].run.push(s);
  }
  return res.map((r) => ({
    name: r.name,
    strength: r.strength.length ? mean(r.strength) : null,
    strengthN: r.strength.length,
    run: r.run.length ? mean(r.run) : null,
    runN: r.run.length,
  }));
}

/** Evolução do volume por modelo de treino (até 3 mais frequentes). */
export function strengthProgress(workouts: RawWorkout[]) {
  const groups = new Map<string, { name: string; pts: { date: string; value: number }[] }>();
  for (const w of workouts) {
    const v = workoutVolume(w);
    if (v <= 0) continue;
    const key = w.template_id ?? w.name.trim().toLowerCase();
    const g = groups.get(key) ?? { name: w.name, pts: [] };
    g.pts.push({ date: w.session_date, value: v });
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.pts.length >= 2)
    .sort((a, b) => b.pts.length - a.pts.length)
    .slice(0, 3)
    .map((g) => {
      const pts = g.pts.sort((a, b) => a.date.localeCompare(b.date));
      const first = mean(pts.slice(0, Math.min(3, pts.length)).map((p) => p.value));
      const last = mean(pts.slice(-Math.min(3, pts.length)).map((p) => p.value));
      return { name: g.name, pts, change: first ? last / first - 1 : null };
    });
}

/** Recordes estimados (1RM de Epley) por exercício e evolução em 8 semanas. */
export function exerciseRecords(workouts: RawWorkout[], today: string) {
  const map = new Map<string, { name: string; best: number; bestDate: string; recent: number; old: number; sessions: Set<string> }>();
  const cut = addDays(today, -56);
  for (const w of workouts) {
    for (const s of w.sets) {
      if (!s.exercise_id || s.weight_kg <= 0 || s.reps <= 0 || s.reps > 20) continue;
      const e1rm = s.weight_kg * (1 + s.reps / 30);
      const cur = map.get(s.exercise_id) ?? { name: s.exercise ?? "Exercício", best: 0, bestDate: w.session_date, recent: 0, old: 0, sessions: new Set() };
      if (e1rm > cur.best) {
        cur.best = e1rm;
        cur.bestDate = w.session_date;
      }
      if (w.session_date >= cut) cur.recent = Math.max(cur.recent, e1rm);
      else cur.old = Math.max(cur.old, e1rm);
      cur.sessions.add(w.session_date);
      map.set(s.exercise_id, cur);
    }
  }
  return [...map.values()]
    .filter((x) => x.sessions.size >= 2)
    .map((x) => ({
      name: x.name,
      best: x.best,
      bestDate: x.bestDate,
      sessions: x.sessions.size,
      change: x.old && x.recent ? x.recent / x.old - 1 : null,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 8);
}

/** Corridas: ritmo (min/km) e eficiência (metros por batimento). */
export function runEfficiency(activities: RawActivity[]) {
  const runs = activities
    .filter(isRun)
    .sort((a, b) => a.activity_date.localeCompare(b.activity_date))
    .map((a) => {
      const pace = a.duration_min / (a.distance_km as number);
      const eff = a.avg_hr ? ((a.distance_km as number) * 1000) / (a.duration_min * a.avg_hr) : null;
      return { date: a.activity_date, pace, eff, km: a.distance_km as number, hr: a.avg_hr };
    });
  const withEff = runs.filter((r) => r.eff != null);
  const t = (xs: { date: string }[], ys: number[]) =>
    xs.length >= 4 ? linreg(xs.map((x) => Date.parse(x.date) / 86400000), ys).slope * 30 : null;
  return {
    runs,
    paceTrend: t(runs, runs.map((r) => r.pace)), // min/km por mês (negativo = mais rápido)
    effTrend: withEff.length >= 4 ? t(withEff, withEff.map((r) => r.eff as number)) : null,
    effAvg: withEff.length ? mean(withEff.map((r) => r.eff as number)) : null,
  };
}

export function rpeDistribution(activities: RawActivity[], workouts: RawWorkout[], from: string) {
  const hist = Array.from({ length: 10 }, () => 0);
  for (const a of activities) if (a.rpe && a.activity_date >= from) hist[a.rpe - 1]++;
  for (const w of workouts) if (w.rpe && w.session_date >= from) hist[w.rpe - 1]++;
  return hist;
}

/* ------------------------------------------------------------- cobertura de dados */

export function coverage(rows: DayRow[]) {
  const n = rows.length || 1;
  const c = (f: (r: DayRow) => boolean) => rows.filter(f).length;
  return {
    days: rows.length,
    items: [
      { key: "diet", label: "Dieta", n: c((r) => r.kcal != null || r.freeMeal != null), pct: 0 },
      { key: "mood", label: "Humor", n: c((r) => r.mood != null), pct: 0 },
      { key: "train", label: "Treino/cardio", n: c((r) => r.active === 1), pct: 0 },
      { key: "weight", label: "Peso", n: c((r) => r.weight != null), pct: 0 },
      { key: "money", label: "Finanças", n: c((r) => r.spend != null), pct: 0 },
    ].map((x) => ({ ...x, pct: x.n / n })),
  };
}
