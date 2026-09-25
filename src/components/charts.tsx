import { formatDayShort } from "@/lib/dates";

/** Dispersão simples com linha de tendência (sem linhas de grade). */
export function Scatter({
  points,
  xLabel,
  yLabel,
}: {
  points: { x: number; y: number }[];
  xLabel: string;
  yLabel: string;
}) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 170;
  const pad = { l: 34, r: 10, t: 10, b: 30 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
  // tendência
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = points.reduce((s, p) => s + (p.x - mx) ** 2, 0) || 1;
  const b = num / den;
  const line = [x0, x1].map((x) => ({ x, y: my + b * (x - mx) }));
  const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(".", ","));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${yLabel} por ${xLabel}`}>
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--color-line)" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--color-line)" />
      <line
        x1={sx(line[0].x)}
        y1={sy(line[0].y)}
        x2={sx(line[1].x)}
        y2={sy(line[1].y)}
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} fill="var(--color-accent)" fillOpacity={0.75} />
      ))}
      <text x={pad.l} y={H - 8} fontSize={10} fill="var(--color-muted)">
        {fmt(x0)}
      </text>
      <text x={W - pad.r} y={H - 8} fontSize={10} fill="var(--color-muted)" textAnchor="end">
        {fmt(x1)}
      </text>
      <text x={(W + pad.l) / 2} y={H - 8} fontSize={10} fill="var(--color-muted)" textAnchor="middle">
        {xLabel}
      </text>
      <text x={4} y={pad.t + 8} fontSize={10} fill="var(--color-muted)">
        {fmt(y1)}
      </text>
      <text x={4} y={H - pad.b} fontSize={10} fill="var(--color-muted)">
        {fmt(y0)}
      </text>
    </svg>
  );
}

/** Consumo por dia (barras) com a linha do gasto estimado. */
export function IntakeChart({ days, target }: { days: { date: string; kcal: number | null }[]; target: number | null }) {
  if (days.length === 0) return null;
  const W = 320;
  const H = 140;
  const pad = { l: 4, r: 4, t: 14, b: 18 };
  const max = Math.max(target ?? 0, ...days.map((d) => d.kcal ?? 0)) * 1.1 || 1;
  const bw = (W - pad.l - pad.r) / days.length;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Calorias consumidas por dia">
      {days.map((d, i) =>
        d.kcal ? (
          <rect
            key={d.date}
            x={pad.l + i * bw + 1}
            y={y(d.kcal)}
            width={Math.max(1, bw - 2)}
            height={H - pad.b - y(d.kcal)}
            rx={2}
            fill={target && d.kcal > target * 1.1 ? "var(--color-warn)" : "var(--color-accent)"}
            fillOpacity={0.85}
          />
        ) : (
          <rect key={d.date} x={pad.l + i * bw + 1} y={H - pad.b - 2} width={Math.max(1, bw - 2)} height={2} fill="var(--color-line)" />
        ),
      )}
      {target ? (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--color-ok)" strokeWidth={2} />
          <text x={W - pad.r} y={y(target) - 4} fontSize={10} textAnchor="end" fill="var(--color-ok)">
            gasto ≈ {Math.round(target)} kcal
          </text>
        </>
      ) : null}
      <text x={pad.l} y={H - 4} fontSize={10} fill="var(--color-muted)">
        {formatDayShort(days[0].date)}
      </text>
      <text x={W - pad.r} y={H - 4} fontSize={10} fill="var(--color-muted)" textAnchor="end">
        {formatDayShort(days[days.length - 1].date)}
      </text>
    </svg>
  );
}
