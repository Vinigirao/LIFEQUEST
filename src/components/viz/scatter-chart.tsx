"use client";

import { useRef, useState } from "react";

export type ScatterPoint = { x: number; y: number; xl: string; yl: string; date: string };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** Dispersão com tendência; toque perto de um ponto para ver o dia. */
export function ScatterChart({
  points,
  xLabel,
  yLabel,
  xTicks,
  yTicks,
  binaryX = false,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xTicks: [string, string];
  yTicks: [string, string];
  binaryX?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 3) return null;
  const W = 340;
  const H = 200;
  const pad = { l: 40, r: 10, t: 10, b: 34 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (binaryX) [x0, x1] = [-0.5, 1.5];
  if (x0 === x1) [x0, x1] = [x0 - 1, x1 + 1];
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
  const yPad = (y1 - y0) * 0.08;
  y0 -= yPad;
  y1 += yPad;
  // espalha levemente valores repetidos (ex.: humor 1–5) para não empilhar
  const jitter = (i: number) => (((i * 7919) % 17) / 17 - 0.5) * (binaryX ? 0.5 : 0);
  const sx = (x: number, i = 0) => pad.l + ((x + jitter(i) - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);

  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = points.reduce((s, p) => s + (p.x - mx) ** 2, 0) || 1;
  const b = num / den;
  const lx = binaryX ? [0, 1] : [Math.min(...xs), Math.max(...xs)];

  const pick = (clientX: number, clientY: number) => {
    const svg = ref.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const px = ((clientX - box.left) / box.width) * W;
    const py = ((clientY - box.top) / box.height) * H;
    let best = -1;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = (sx(p.x, i) - px) ** 2 + (sy(p.y) - py) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(bd < 40 * 40 ? best : null);
  };

  const hp = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={`${yLabel} por ${xLabel}`}
        onPointerMove={(e) => pick(e.clientX, e.clientY)}
        onPointerDown={(e) => pick(e.clientX, e.clientY)}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--color-line)" />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="var(--color-line)" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x, i)}
            cy={sy(p.y)}
            r={hover === i ? 6 : 4}
            fill="var(--color-accent)"
            fillOpacity={hover === i ? 1 : 0.6}
            stroke="var(--color-card)"
            strokeWidth={hover === i ? 2 : 1}
          />
        ))}
        <line
          x1={sx(lx[0])}
          y1={sy(my + b * (lx[0] - mx))}
          x2={sx(lx[1])}
          y2={sy(my + b * (lx[1] - mx))}
          stroke="var(--color-fg)"
          strokeOpacity={0.8}
          strokeWidth={2}
        />
        <text x={pad.l} y={H - pad.b + 14} fontSize={10} fill="var(--color-muted)">
          {xTicks[0]}
        </text>
        <text x={W - pad.r} y={H - pad.b + 14} fontSize={10} fill="var(--color-muted)" textAnchor="end">
          {xTicks[1]}
        </text>
        <text x={(W + pad.l) / 2} y={H - 4} fontSize={10} fill="var(--color-muted)" textAnchor="middle">
          {xLabel}
        </text>
        <text x={pad.l - 4} y={pad.t + 8} fontSize={10} fill="var(--color-muted)" textAnchor="end">
          {yTicks[1]}
        </text>
        <text x={pad.l - 4} y={H - pad.b} fontSize={10} fill="var(--color-muted)" textAnchor="end">
          {yTicks[0]}
        </text>
      </svg>
      <p className="-mt-1 text-[10px] text-muted">Vertical: {yLabel} · linha branca = tendência</p>
      {hp && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-card-2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${(sx(hp.x, hover as number) / W) * 100}%`,
            transform: sx(hp.x, hover as number) > W / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
          }}
        >
          <p className="text-[10px] text-muted">{dayLabel(hp.date)}</p>
          <p className="whitespace-nowrap">
            <b>{hp.yl}</b> <span className="text-muted">{yLabel}</span>
          </p>
          <p className="whitespace-nowrap">
            <b>{hp.xl}</b> <span className="text-muted">{xLabel}</span>
          </p>
        </div>
      )}
    </div>
  );
}
