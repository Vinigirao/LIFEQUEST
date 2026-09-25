/* =============================================================
 * Estatística pura (sem banco), usada pela aba Análises.
 * ============================================================= */

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

export function sd(xs: number[]) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Quantil (0–1) com interpolação linear. */
export function quantile(xs: number[], q: number) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (xs: number[]) => quantile(xs, 0.5);

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

/** Postos com empate recebendo a média dos postos. */
export function ranks(xs: number[]) {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k][1]] = r;
    i = j + 1;
  }
  return out;
}

/** Correlação de Spearman: robusta a valores extremos e relações não lineares. */
export function spearman(xs: number[], ys: number[]) {
  return pearson(ranks(xs), ranks(ys));
}

/* ------------------------------------------------------------- p-valor */

function lnGamma(z: number): number {
  // Lanczos
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a: number, b: number, x: number) {
  const MAXIT = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Beta incompleta regularizada I_x(a, b). */
export function betaInc(x: number, a: number, b: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** p-valor bicaudal da t de Student. */
export function tTwoSided(t: number, df: number) {
  if (!Number.isFinite(t) || df <= 0) return 1;
  return betaInc(df / (df + t * t), df / 2, 0.5);
}

/** p-valor de uma correlação r com n pares (teste t). */
export function pFromR(r: number, n: number) {
  if (!Number.isFinite(r) || n < 4) return 1;
  const rr = Math.min(0.999999, Math.abs(r));
  const t = rr * Math.sqrt((n - 2) / (1 - rr * rr));
  return tTwoSided(t, n - 2);
}

/** Teste t de Welch para duas médias. */
export function welch(a: number[], b: number[]) {
  if (a.length < 2 || b.length < 2) return { t: NaN, p: 1 };
  const va = sd(a) ** 2 / a.length;
  const vb = sd(b) ** 2 / b.length;
  const se = Math.sqrt(va + vb);
  if (!se) return { t: NaN, p: mean(a) === mean(b) ? 1 : 0 };
  const t = (mean(a) - mean(b)) / se;
  const df = (va + vb) ** 2 / ((va * va) / (a.length - 1) + (vb * vb) / (b.length - 1));
  return { t, p: tTwoSided(t, df) };
}

/** Benjamini–Hochberg: corrige para "muitos testes ao mesmo tempo". Devolve q-valores na mesma ordem. */
export function benjaminiHochberg(ps: number[]) {
  const n = ps.length;
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(n);
  let min = 1;
  for (let k = n - 1; k >= 0; k--) {
    const [p, i] = order[k];
    min = Math.min(min, (p * n) / (k + 1));
    q[i] = min;
  }
  return q;
}

/* ------------------------------------------------------------- séries */

export function linreg(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: NaN, intercept: NaN };
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : NaN;
  return { slope, intercept: my - slope * mx };
}

/** Média móvel (janela para trás), ignorando dias sem dado. */
export function rolling(values: (number | null)[], window: number, minCount = Math.max(1, Math.ceil(window / 3))) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter(isNum);
    return slice.length >= minCount ? mean(slice) : null;
  });
}

/** Média exponencial (bom para peso: suaviza a variação de água). */
export function ewma(values: (number | null)[], alpha = 0.1) {
  let cur: number | null = null;
  return values.map((v) => {
    if (isNum(v)) cur = cur == null ? v : cur + alpha * (v - cur);
    return cur;
  });
}
