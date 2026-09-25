import type { ReactNode } from "react";
import { SERIES, SINGLE, sequentialColor } from "./palette";

/* Gráficos simples renderizados no servidor (sem linhas de grade). O valor vai no rótulo e no "title". */

export function Sparkline({ values, color = SINGLE, height = 28 }: { values: (number | null)[]; color?: string; height?: number }) {
  const v = values.map((x, i) => [i, x] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (v.length < 2) return <div style={{ height }} />;
  const W = 100;
  const H = height;
  const lo = Math.min(...v.map((p) => p[1]));
  const hi = Math.max(...v.map((p) => p[1]));
  const x = (i: number) => (i / (values.length - 1)) * (W - 4) + 2;
  const y = (n: number) => 3 + (1 - (n - lo) / (hi - lo || 1)) * (H - 6);
  const d = v.map(([i, n], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(" ");
  const last = v[v.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(last[0])} cy={y(last[1])} r={2.2} fill={color} />
    </svg>
  );
}

/** Duas barras horizontais: grupo "alto/sim" × "baixo/não". */
export function CompareBars({
  rows,
}: {
  rows: { label: string; value: number; display: string; n: number; strong?: boolean }[];
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,42%)_1fr] items-center gap-2 text-xs">
          <span className="truncate text-muted" title={`${r.label} · ${r.n} dias`}>
            {r.label}
          </span>
          <div className="flex items-center gap-2">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-card-2">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(3, (Math.abs(r.value) / max) * 100)}%`, background: r.strong ? SINGLE : "var(--color-muted)", opacity: r.strong ? 1 : 0.55 }}
              />
            </div>
            <span className={`w-16 shrink-0 text-right tabular-nums ${r.strong ? "font-semibold text-fg" : "text-muted"}`}>{r.display}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Colunas com rótulo de valor em cima (ex.: dias da semana). */
export function Columns({
  items,
  height = 110,
  color = SINGLE,
}: {
  items: { label: string; value: number | null; display: string; highlight?: boolean; title?: string }[];
  height?: number;
  color?: string;
}) {
  const max = Math.max(...items.map((i) => i.value ?? 0), 1e-9);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {items.map((it, i) => (
        <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={it.title ?? `${it.label}: ${it.display}`}>
          <span className={`text-[10px] tabular-nums ${it.highlight ? "font-semibold text-fg" : "text-muted"}`}>{it.value == null ? "" : it.display}</span>
          <div
            className="w-full rounded-t"
            style={{
              height: `${it.value == null ? 2 : Math.max(3, (it.value / max) * 100)}%`,
              background: it.value == null ? "var(--color-line)" : color,
              opacity: it.value == null ? 1 : it.highlight ? 1 : 0.5,
              maxHeight: "calc(100% - 28px)",
            }}
          />
          <span className="text-[10px] text-muted">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Colunas empilhadas de duas séries, com legenda. */
export function StackedColumns({
  items,
  names,
  height = 120,
}: {
  items: { label: string; a: number; b: number; title?: string }[];
  names: [string, string];
  height?: number;
}) {
  const max = Math.max(...items.map((i) => i.a + i.b), 1);
  return (
    <div>
      <Legend items={names.map((n, i) => ({ name: n, color: SERIES[i] }))} box />
      <div className="mt-2 flex items-end gap-1" style={{ height }}>
        {items.map((it) => (
          <div key={it.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={it.title}>
            <span className="text-[9px] tabular-nums text-muted">{it.a + it.b || ""}</span>
            <div className="flex w-full flex-col-reverse gap-[2px]" style={{ height: `${((it.a + it.b) / max) * 100}%`, maxHeight: "calc(100% - 26px)" }}>
              {it.a > 0 && <div className="w-full rounded-b-sm" style={{ flex: it.a, background: SERIES[0] }} />}
              {it.b > 0 && <div className="w-full rounded-t-sm" style={{ flex: it.b, background: SERIES[1] }} />}
            </div>
            <span className="text-[9px] text-muted">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items, box = false }: { items: { name: string; color: string }[]; box?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-muted">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <span className={box ? "inline-block h-2.5 w-2.5 rounded-sm" : "inline-block h-0.5 w-4 rounded"} style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

/** Barra 100% empilhada (ex.: macros). */
export function SplitBar({ parts }: { parts: { name: string; value: number; display: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {parts.map((p, i) => (
          <div key={p.name} style={{ width: `${(p.value / total) * 100}%`, background: SERIES[i] }} title={`${p.name}: ${p.display}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p, i) => (
          <span key={p.name} className="inline-flex items-center gap-1.5 text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i] }} />
            {p.name} <b className="text-fg">{p.display}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Mapa de calor com escala por linha: cada métrica vira "mais claro = maior". */
export function RowHeat({
  cols,
  rows,
}: {
  cols: string[];
  rows: { label: string; values: (number | null)[]; display: (string | null)[]; invert?: boolean }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-center text-[11px]">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="pb-1 font-medium text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const vals = r.values.filter((v): v is number => v != null);
            const lo = Math.min(...vals);
            const hi = Math.max(...vals);
            return (
              <tr key={r.label}>
                <th className="pr-1 text-left font-normal whitespace-nowrap text-muted">{r.label}</th>
                {r.values.map((v, i) => {
                  const t = v == null || hi === lo ? 0.35 : (v - lo) / (hi - lo);
                  return (
                    <td
                      key={i}
                      title={`${r.label} · ${cols[i]}: ${r.display[i] ?? "sem dados"}`}
                      className="h-8 rounded-md tabular-nums"
                      style={{ background: v == null ? "var(--color-card-2)" : sequentialColor(t), color: t > 0.6 ? "#0b0d10" : "var(--color-fg)" }}
                    >
                      {r.display[i] ?? "·"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "bad" | "warn" }) {
  return (
    <div className="rounded-xl bg-card-2 px-2 py-2 text-center">
      <p className="text-[10px] text-muted">{label}</p>
      <p className={`text-base font-bold ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}
