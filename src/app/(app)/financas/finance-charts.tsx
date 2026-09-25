import { METHOD_SHORT, type Method } from "@/lib/finance/method";

const brlK = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : `R$ ${Math.round(n)}`;

/** Gasto acumulado no mês × mês anterior × meta (sem linhas de grade). */
export function BurnChart({
  current,
  previous,
  limit,
  today,
}: {
  current: number[];
  previous: number[];
  limit: number | null;
  today: number | null;
}) {
  const W = 320;
  const H = 150;
  const pad = { l: 4, r: 4, t: 16, b: 18 };
  const days = Math.max(current.length, previous.length);
  const shown = today ? current.slice(0, today) : current;
  const max = Math.max(limit ?? 0, ...shown, ...previous, 1) * 1.08;
  const x = (i: number) => pad.l + (i / Math.max(days - 1, 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = shown.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gasto acumulado no mês">
      {limit ? (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={y(limit)} y2={y(limit)} stroke="var(--color-bad)" strokeDasharray="4 4" />
          <text x={pad.l + 2} y={y(limit) - 4} fontSize={10} fill="var(--color-bad)">
            meta {brlK(limit)}
          </text>
        </>
      ) : null}
      {previous.length > 1 && <path d={path(previous)} fill="none" stroke="var(--color-muted)" strokeWidth={1.5} strokeOpacity={0.6} />}
      {shown.length > 1 && <path d={path(shown)} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} strokeLinejoin="round" />}
      {last >= 0 && (
        <>
          <circle cx={x(last)} cy={y(shown[last])} r={4} fill="var(--color-accent)" />
          <text x={Math.min(x(last), W - 60)} y={y(shown[last]) - 8} fontSize={11} fontWeight={600} fill="var(--color-fg)">
            {brlK(shown[last])}
          </text>
        </>
      )}
      <text x={pad.l} y={H - 4} fontSize={10} fill="var(--color-muted)">
        dia 1
      </text>
      <text x={W - pad.r} y={H - 4} fontSize={10} fill="var(--color-muted)" textAnchor="end">
        dia {days}
      </text>
    </svg>
  );
}

const METHOD_COLOR: Record<Method, string> = {
  cartao: "#a78bfa",
  pix: "#38bdf8",
  debito: "#f59e0b",
  boleto: "#f472b6",
  transferencia: "#34d399",
  outro: "#6b7280",
};

/** Barra empilhada por forma de pagamento. */
export function MethodBar({ data }: { data: [Method, number][] }) {
  const total = data.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-card-2">
        {data.map(([m, v]) => (
          <div key={m} style={{ width: `${(v / total) * 100}%`, background: METHOD_COLOR[m] }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {data.map(([m, v]) => (
          <div key={m} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: METHOD_COLOR[m] }} />
              {METHOD_SHORT[m]}
            </span>
            <span className="tabular-nums">{brlK(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barras de parcelas futuras por mês. */
export function CommittedBars({ schedule }: { schedule: { month: string; amount: number }[] }) {
  const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const max = Math.max(1, ...schedule.map((s) => s.amount));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {schedule.map((s) => (
        <div key={s.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[9px] tabular-nums text-muted">{s.amount ? brlK(s.amount).replace("R$ ", "") : ""}</span>
          <div
            className="w-full rounded-t"
            style={{ height: `${Math.max(2, (s.amount / max) * 100)}%`, background: s.amount ? "var(--color-accent)" : "var(--color-line)" }}
          />
          <span className="text-[9px] text-muted">{MONTHS[Number(s.month.slice(5, 7)) - 1]}</span>
        </div>
      ))}
    </div>
  );
}
