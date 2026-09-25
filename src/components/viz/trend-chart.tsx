"use client";

import { useRef, useState } from "react";

export type TrendSeries = {
  name: string;
  color: string;
  values: (number | null)[];
  /** pontos soltos (ex.: pesagens) desenhados atrás da linha */
  dots?: (number | null)[];
  width?: number;
  dashed?: boolean;
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/**
 * Linha(s) no tempo com cursor: toque/arraste para ver os valores do dia.
 * Sem linhas de grade; rótulo só no último ponto; legenda quando há 2+ séries.
 */
export function TrendChart({
  dates,
  series,
  unit = "",
  digits = 0,
  height = 150,
  yMin,
  yMax,
  reference,
  label,
}: {
  dates: string[];
  series: TrendSeries[];
  unit?: string;
  digits?: number;
  height?: number;
  yMin?: number;
  yMax?: number;
  reference?: { value: number; label: string };
  label: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 340;
  const H = height;
  const pad = { l: 6, r: 44, t: 12, b: 20 };
  const all = series.flatMap((s) => [...s.values, ...(s.dots ?? [])]).filter((v): v is number => v != null && Number.isFinite(v));
  if (reference) all.push(reference.value);
  if (all.length < 2 || dates.length < 2) return null;
  let lo = yMin ?? Math.min(...all);
  let hi = yMax ?? Math.max(...all);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const span = hi - lo;
  if (yMin == null) lo -= span * 0.08;
  if (yMax == null) hi += span * 0.08;
  const x = (i: number) => pad.l + (i / (dates.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits });

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const pick = (clientX: number) => {
    const svg = ref.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const px = ((clientX - box.left) / box.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (dates.length - 1));
    setHover(Math.max(0, Math.min(dates.length - 1, i)));
  };

  const lastIdx = (vals: (number | null)[]) => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i;
    return -1;
  };

  return (
    <div className="relative">
      {series.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-3 text-[11px] text-muted">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={label}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {reference && (
          <>
            <line x1={pad.l} x2={W - pad.r} y1={y(reference.value)} y2={y(reference.value)} stroke="var(--color-muted)" strokeOpacity={0.6} strokeDasharray="3 4" />
            <text x={W - pad.r + 4} y={y(reference.value) + 3} fontSize={9} fill="var(--color-muted)">
              {reference.label}
            </text>
          </>
        )}
        {series.map((s) =>
          s.dots?.map((v, i) =>
            v == null ? null : <circle key={`${s.name}-d${i}`} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} fillOpacity={0.35} />,
          ),
        )}
        {series.map((s) => (
          <path
            key={s.name}
            d={path(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width ?? 2}
            strokeDasharray={s.dashed ? "4 4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((s) => {
          const i = lastIdx(s.values);
          if (i < 0) return null;
          const v = s.values[i] as number;
          return (
            <g key={`${s.name}-end`}>
              <circle cx={x(i)} cy={y(v)} r={3.5} fill={s.color} stroke="var(--color-card)" strokeWidth={2} />
              <text x={x(i) + 6} y={y(v) + 4} fontSize={11} fontWeight={600} fill="var(--color-fg)">
                {fmt(v)}
              </text>
            </g>
          );
        })}
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--color-muted)" strokeOpacity={0.7} />
            {series.map((s) => {
              const v = s.values[hover] ?? s.dots?.[hover];
              return v == null ? null : (
                <circle key={`${s.name}-h`} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="var(--color-card)" strokeWidth={2} />
              );
            })}
          </>
        )}
        <text x={pad.l} y={H - 4} fontSize={10} fill="var(--color-muted)">
          {dayLabel(dates[0])}
        </text>
        <text x={W - pad.r} y={H - 4} fontSize={10} fill="var(--color-muted)" textAnchor="end">
          {dayLabel(dates[dates.length - 1])}
        </text>
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-card-2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: x(hover) > W / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
          }}
        >
          <p className="text-[10px] text-muted">{dayLabel(dates[hover])}</p>
          {series.map((s) => {
            const v = s.values[hover];
            const d = s.dots?.[hover];
            return (
              <p key={s.name} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                <b className="text-fg">{v == null ? "–" : `${fmt(v)}${unit ? ` ${unit}` : ""}`}</b>
                <span className="text-muted">{s.name}</span>
                {d != null && <span className="text-muted">· medido {fmt(d)}</span>}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
