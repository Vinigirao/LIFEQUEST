import { addDays } from "@/lib/dates";
import { benjaminiHochberg, isNum, mean, pearson, pFromR, sd, spearman, welch } from "@/lib/stats";
import type { DailyData, DayRow } from "./daily";

/* =============================================================
 * Motor de descobertas: testa todas as combinações
 * "fator (mesmo dia ou dia anterior) → resultado" e explica em português.
 * ============================================================= */

export type Group = "dieta" | "treino" | "cabeca" | "corpo" | "dinheiro";

export type VarDef = {
  key: string;
  label: string; // "Proteína"
  short: string; // cabeçalho curto da matriz
  unit: string;
  group: Group;
  binary?: boolean;
  get: (r: DayRow) => number | null;
  fmt: (v: number) => string;
  /** fator binário: "treinou força" · contínuo: "mais proteína" */
  phrase: string;
  /** só faz sentido no mesmo dia (já olha para trás) */
  sameDayOnly?: boolean;
  /** resultado: frase com a diferença (d com sinal) */
  say?: (d: number) => string;
  /** resultado: 1 = subir é bom, −1 = subir é ruim, 0 = neutro */
  better?: 1 | -1 | 0;
};

export const num = (v: number, digits = 0) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const brl = (v: number) => `R$ ${num(v)}`;
const pts = (d: number) => `${num(Math.abs(d), 1)} ponto${Math.abs(d) >= 0.95 && Math.abs(d) < 1.05 ? "" : "s"}`;
const hour = (h: number) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const pct = (v: number) => `${num(v * 100)}%`;

/* ------------------------------------------------------------- variáveis */

export function buildVars(data: DailyData, rows: DayRow[]): { factors: VarDef[]; outcomes: VarDef[] } {
  const base: VarDef[] = [
    // resultados
    {
      key: "mood",
      label: "Humor",
      short: "Humor",
      unit: "1–5",
      group: "cabeca",
      get: (r) => r.mood,
      fmt: (v) => num(v, 1),
      phrase: "humor mais alto",
      say: (d) => `Humor ${pts(d)} ${d > 0 ? "mais alto" : "mais baixo"}`,
      better: 1,
    },
    {
      key: "energy",
      label: "Energia",
      short: "Energia",
      unit: "1–5",
      group: "cabeca",
      get: (r) => r.energy,
      fmt: (v) => num(v, 1),
      phrase: "mais energia",
      say: (d) => `Energia ${pts(d)} ${d > 0 ? "mais alta" : "mais baixa"}`,
      better: 1,
    },
    {
      key: "strengthScore",
      label: "Volume do treino",
      short: "Força",
      unit: "% da média",
      group: "treino",
      get: (r) => r.strengthScore,
      fmt: (v) => `${num(v)}%`,
      phrase: "treino de força mais forte",
      say: (d) => `Volume do treino ${num(Math.abs(d))}% ${d > 0 ? "maior" : "menor"}`,
      better: 1,
    },
    {
      key: "runScore",
      label: "Ritmo da corrida",
      short: "Corrida",
      unit: "% da média",
      group: "treino",
      get: (r) => r.runScore,
      fmt: (v) => `${num(v)}%`,
      phrase: "corrida mais rápida",
      say: (d) => `Corrida ${num(Math.abs(d))}% ${d > 0 ? "mais rápida" : "mais lenta"}`,
      better: 1,
    },
    {
      key: "active",
      label: "Treinou",
      short: "Treinou",
      unit: "sim/não",
      group: "treino",
      binary: true,
      get: (r) => r.active,
      fmt: pct,
      phrase: "treinou",
      say: (d) => `Chance de treinar ${num(Math.abs(d) * 100)} p.p. ${d > 0 ? "maior" : "menor"}`,
      better: 1,
    },
    {
      key: "kcal",
      label: "Calorias",
      short: "Kcal",
      unit: "kcal",
      group: "dieta",
      get: (r) => r.kcal,
      fmt: (v) => `${num(v)} kcal`,
      phrase: "mais calorias",
      say: (d) => `Você come ${num(Math.abs(d))} kcal a ${d > 0 ? "mais" : "menos"}`,
      better: 0,
    },
    {
      key: "spend",
      label: "Gasto do dia",
      short: "Gasto",
      unit: "R$",
      group: "dinheiro",
      get: (r) => r.spend,
      fmt: brl,
      phrase: "mais gasto",
      say: (d) => `Você gasta ${brl(Math.abs(d))} a ${d > 0 ? "mais" : "menos"}`,
      better: -1,
    },
    // só fatores
    { key: "protein", label: "Proteína", short: "Proteína", unit: "g", group: "dieta", get: (r) => r.protein, fmt: (v) => `${num(v)} g`, phrase: "mais proteína" },
    { key: "carbs", label: "Carboidrato", short: "Carbo", unit: "g", group: "dieta", get: (r) => r.carbs, fmt: (v) => `${num(v)} g`, phrase: "mais carboidrato" },
    { key: "fat", label: "Gordura", short: "Gordura", unit: "g", group: "dieta", get: (r) => r.fat, fmt: (v) => `${num(v)} g`, phrase: "mais gordura" },
    {
      key: "freeMeal",
      label: "Refeição livre",
      short: "Livre",
      unit: "sim/não",
      group: "dieta",
      binary: true,
      get: (r) => r.freeMeal,
      fmt: pct,
      phrase: "fez refeição livre",
    },
    {
      key: "lastMeal",
      label: "Horário da última refeição",
      short: "Últ. ref.",
      unit: "hora",
      group: "dieta",
      get: (r) => r.lastMeal,
      fmt: hour,
      phrase: "a última refeição mais tarde",
    },
    {
      key: "firstMeal",
      label: "Horário da primeira refeição",
      short: "1ª ref.",
      unit: "hora",
      group: "dieta",
      get: (r) => r.firstMeal,
      fmt: hour,
      phrase: "a primeira refeição mais tarde",
    },
    {
      key: "strength",
      label: "Treino de força",
      short: "Musc.",
      unit: "sim/não",
      group: "treino",
      binary: true,
      get: (r) => r.strength,
      fmt: pct,
      phrase: "treinou força",
    },
    {
      key: "cardioMin",
      label: "Minutos de cardio",
      short: "Cardio",
      unit: "min",
      group: "treino",
      get: (r) => r.cardioMin,
      fmt: (v) => `${num(v)} min`,
      phrase: "mais cardio",
    },
    {
      key: "activeKcal",
      label: "Calorias gastas em atividades",
      short: "Kcal ativ.",
      unit: "kcal",
      group: "treino",
      get: (r) => r.activeKcal,
      fmt: (v) => `${num(v)} kcal`,
      phrase: "mais calorias gastas em atividades",
    },
    {
      key: "trainRpe",
      label: "Esforço percebido (RPE)",
      short: "RPE",
      unit: "1–10",
      group: "treino",
      get: (r) => r.trainRpe,
      fmt: (v) => num(v, 1),
      phrase: "treino mais puxado",
    },
    {
      key: "restBefore",
      label: "Dias de descanso antes",
      short: "Descanso",
      unit: "dias",
      group: "treino",
      get: (r) => r.restBefore,
      fmt: (v) => `${num(v, 1)} d`,
      phrase: "mais dias de descanso antes",
      sameDayOnly: true,
    },
  ];

  // Categorias de gasto que aparecem com frequência no período
  const cats = data.expenseCats
    .map((c) => {
      const days = rows.filter((r) => r.spend != null && (r.cat[c.id] ?? 0) > 0);
      return { c, days: days.length, total: days.reduce((s, r) => s + r.cat[c.id], 0) };
    })
    .filter((x) => x.days >= 4)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const moneyDays = rows.filter((r) => r.spend != null).length || 1;
  for (const { c, days } of cats) {
    const sporadic = days / moneyDays < 0.5;
    base.push(
      sporadic
        ? {
            key: `cat:${c.id}`,
            label: `Gasto com ${c.name}`,
            short: c.name.slice(0, 9),
            unit: "sim/não",
            group: "dinheiro",
            binary: true,
            get: (r) => (r.spend == null ? null : (r.cat[c.id] ?? 0) > 0 ? 1 : 0),
            fmt: pct,
            phrase: `gastou com ${c.name}`,
          }
        : {
            key: `cat:${c.id}`,
            label: `Gasto com ${c.name}`,
            short: c.name.slice(0, 9),
            unit: "R$",
            group: "dinheiro",
            get: (r) => (r.spend == null ? null : (r.cat[c.id] ?? 0)),
            fmt: brl,
            phrase: `mais gasto com ${c.name}`,
          },
    );
  }

  const OUT = ["mood", "energy", "strengthScore", "runScore", "active", "kcal", "spend"];
  return {
    outcomes: OUT.map((k) => base.find((v) => v.key === k)!),
    factors: base.filter((v) => v.key !== "strengthScore" && v.key !== "runScore" && v.key !== "active"),
  };
}

/* ------------------------------------------------------------- testes */

export type Level = "forte" | "boa" | "pista" | "fraca";

export type Finding = {
  id: string;
  x: VarDef;
  y: VarDef;
  lag: 0 | 1;
  n: number;
  r: number;
  p: number;
  q: number;
  level: Level;
  hi: { label: string; mean: number; n: number };
  lo: { label: string; mean: number; n: number };
  effect: number;
  headline: string;
  question: string;
  points: { x: number; y: number; date: string }[];
};

export const LEVEL_TEXT: Record<Level, string> = {
  forte: "evidência forte",
  boa: "boa evidência",
  pista: "pista",
  fraca: "sem relação clara",
};

/** Combinações que são óbvias ou medem a mesma coisa. */
function skip(x: VarDef, y: VarDef, lag: 0 | 1) {
  if (x.key === y.key) return true;
  if (lag === 1 && x.sameDayOnly) return true;
  if (lag === 0 && x.group === y.group) return true;
  // quem treinou tem RPE / calorias de atividade: óbvio para "treinou" e desempenho no mesmo dia
  if (lag === 0 && y.group === "treino" && x.group === "treino") return true;
  // "treinei ontem → treino hoje?" reflete só a sua agenda de treinos, não um efeito
  if (y.key === "active" && x.group === "treino") return true;
  return false;
}

export function testPair(rows: DayRow[], byDate: Map<string, DayRow>, x: VarDef, y: VarDef, lag: 0 | 1, minN = 8) {
  const pts: { x: number; y: number; date: string }[] = [];
  for (const r of rows) {
    const yv = y.get(r);
    if (!isNum(yv)) continue;
    const src = lag ? byDate.get(addDays(r.date, -1)) : r;
    if (!src) continue;
    const xv = x.get(src);
    if (!isNum(xv)) continue;
    pts.push({ x: xv, y: yv, date: r.date });
  }
  if (pts.length < minN) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  if (sd(ys) === 0 || sd(xs) === 0) return null;

  let r: number;
  let p: number;
  let hi: { label: string; mean: number; n: number };
  let lo: { label: string; mean: number; n: number };
  if (x.binary) {
    const a = pts.filter((q) => q.x === 1).map((q) => q.y);
    const b = pts.filter((q) => q.x === 0).map((q) => q.y);
    if (a.length < 3 || b.length < 3) return null;
    r = pearson(xs, ys);
    p = welch(a, b).p;
    hi = { label: "Sim", mean: mean(a), n: a.length };
    lo = { label: "Não", mean: mean(b), n: b.length };
  } else {
    r = spearman(xs, ys);
    p = pFromR(r, pts.length);
    const sorted = [...pts].sort((m, n) => m.x - n.x);
    const k = Math.max(2, Math.floor(sorted.length / 3));
    const low = sorted.slice(0, k);
    const high = sorted.slice(-k);
    const loMax = low[low.length - 1].x;
    const hiMin = high[0].x;
    if (loMax >= hiMin) {
      // muitos empates: divide acima/abaixo da mediana
      const med = sorted[Math.floor(sorted.length / 2)].x;
      const A = pts.filter((q) => q.x > med);
      const B = pts.filter((q) => q.x <= med);
      if (A.length < 3 || B.length < 3) return null;
      hi = { label: `Acima de ${x.fmt(med)}`, mean: mean(A.map((q) => q.y)), n: A.length };
      lo = { label: `Até ${x.fmt(med)}`, mean: mean(B.map((q) => q.y)), n: B.length };
    } else {
      hi = { label: `Alto (${x.fmt(hiMin)} ou mais)`, mean: mean(high.map((q) => q.y)), n: high.length };
      lo = { label: `Baixo (até ${x.fmt(loMax)})`, mean: mean(low.map((q) => q.y)), n: low.length };
    }
  }
  if (!Number.isFinite(r)) return null;
  return { r, p, hi, lo, n: pts.length, points: pts };
}

function levelOf(p: number, q: number, n: number): Level {
  if (q < 0.1 && n >= 12) return "forte";
  if (p < 0.05) return "boa";
  if (p < 0.15) return "pista";
  return "fraca";
}

function describe(x: VarDef, y: VarDef, lag: 0 | 1, effect: number) {
  const cond = x.binary
    ? lag
      ? `quando no dia anterior você ${x.phrase}`
      : `nos dias em que você ${x.phrase}`
    : lag
      ? `depois de dias com ${x.phrase}`
      : `nos dias com ${x.phrase}`;
  const headline = `${y.say ? y.say(effect) : y.label} ${cond}`;
  const question = x.binary
    ? `${lag ? "No dia anterior, " : ""}${x.phrase.replace(/^./, (c) => (lag ? c : c.toUpperCase()))}?`
    : `${x.label}${lag ? " no dia anterior" : " no dia"}`;
  return { headline, question };
}

export function discover(data: DailyData, rows: DayRow[]) {
  const { factors, outcomes } = buildVars(data, rows);
  const raw: Omit<Finding, "q" | "level">[] = [];
  for (const y of outcomes) {
    for (const x of factors) {
      for (const lag of [0, 1] as const) {
        if (skip(x, y, lag)) continue;
        const t = testPair(rows, data.byDate, x, y, lag);
        if (!t) continue;
        const effect = t.hi.mean - t.lo.mean;
        raw.push({ id: `${x.key}|${y.key}|${lag}`, x, y, lag, effect, ...t, ...describe(x, y, lag, effect) });
      }
    }
  }
  const qs = benjaminiHochberg(raw.map((f) => f.p));
  const all: Finding[] = raw.map((f, i) => ({ ...f, q: qs[i], level: levelOf(f.p, qs[i], f.n) }));

  // Descobertas: melhor versão (mesmo dia ou dia anterior) de cada par
  const best = new Map<string, Finding>();
  for (const f of all) {
    if (f.level === "fraca") continue;
    const k = `${f.x.key}|${f.y.key}`;
    const cur = best.get(k);
    if (!cur || f.p < cur.p) best.set(k, f);
  }
  const findings = [...best.values()].sort((a, b) => a.p - b.p || Math.abs(b.r) - Math.abs(a.r));

  return { factors, outcomes, all, findings, tests: raw.length };
}

/* ------------------------------------------------------------- melhores × piores dias */

export type DayContrast = { v: VarDef; lag: 0 | 1; good: number; bad: number; z: number };

/**
 * Separa os 25% dias de melhor humor (desempate pela energia) e os 25% piores,
 * e mostra o que foi diferente neles (no dia ou no dia anterior).
 */
export function bestVsWorst(data: DailyData, rows: DayRow[], factors: VarDef[]) {
  const scored = rows
    .filter((r) => r.mood != null)
    .map((r) => ({ r, s: (r.mood as number) + (r.energy ?? r.mood as number) / 10 }))
    .sort((a, b) => b.s - a.s);
  if (scored.length < 12) return null;
  const k = Math.max(3, Math.floor(scored.length / 4));
  const good = scored.slice(0, k).map((x) => x.r);
  const bad = scored.slice(-k).map((x) => x.r);
  if (mean(good.map((r) => r.mood as number)) === mean(bad.map((r) => r.mood as number))) return null;

  const out: DayContrast[] = [];
  const candidates = [...factors.filter((f) => f.group !== "cabeca")];
  for (const v of candidates) {
    let pick: DayContrast | null = null;
    for (const lag of [0, 1] as const) {
      if (lag && v.sameDayOnly) continue;
      const val = (r: DayRow) => {
        const src = lag ? data.byDate.get(addDays(r.date, -1)) : r;
        return src ? v.get(src) : null;
      };
      const g = good.map(val).filter(isNum);
      const b = bad.map(val).filter(isNum);
      if (g.length < 3 || b.length < 3) continue;
      const all = [...g, ...b];
      const s = sd(all) || 1;
      const c = { v, lag, good: mean(g), bad: mean(b), z: (mean(g) - mean(b)) / s };
      if (!pick || Math.abs(c.z) > Math.abs(pick.z)) pick = c;
    }
    if (pick && Math.abs(pick.z) >= 0.15) out.push(pick);
  }
  return {
    n: k,
    goodMood: mean(good.map((r) => r.mood as number)),
    badMood: mean(bad.map((r) => r.mood as number)),
    rows: out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 8),
  };
}
