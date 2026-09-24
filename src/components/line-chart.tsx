import { formatDayShort } from "@/lib/dates";

/** Gráfico de linha simples em SVG (sem linhas de grade). */
export function LineChart({
  points,
  unit,
  height = 140,
}: {
  points: { date: string; value: number }[];
  unit: string;
  height?: number;
}) {
  if (points.length < 2) return null;
  const W = 320;
  const H = height;
  const pad = { t: 16, r: 8, b: 20, l: 8 };
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points[points.length - 1].date);
  const x = (d: string) => pad.l + ((Date.parse(d) - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Evolução em ${unit}`}>
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.date)} cy={y(last.value)} r={4} fill="var(--color-accent)" />
      <text x={x(last.date)} y={y(last.value) - 8} textAnchor="end" fontSize={11} fill="var(--color-fg)" fontWeight={600}>
        {last.value.toLocaleString("pt-BR")} {unit}
      </text>
      <text x={pad.l} y={H - 4} fontSize={10} fill="var(--color-muted)">
        {formatDayShort(first.date)}
      </text>
      <text x={W - pad.r} y={H - 4} fontSize={10} fill="var(--color-muted)" textAnchor="end">
        {formatDayShort(last.date)}
      </text>
    </svg>
  );
}
