import { Trophy } from "lucide-react";
import { Empty, SectionTitle } from "@/components/ui";
import { Columns, Sparkline, StackedColumns, Stat } from "@/components/viz/charts";
import { SERIES, SINGLE } from "@/components/viz/palette";
import { TrendChart } from "@/components/viz/trend-chart";
import { addDays, formatDayShort } from "@/lib/dates";
import { byTimeOfDay, exerciseRecords, rpeDistribution, runEfficiency, streaks, strengthProgress, weeklyLoad } from "@/lib/insights/patterns";
import { mean, rolling } from "@/lib/stats";
import { type Ctx, num, signed } from "./ctx";

const pace = (minPerKm: number) => {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, "0")}`;
};

export function Treino({ ctx }: { ctx: Ctx }) {
  const { today } = ctx;
  const last28 = ctx.data.rows.filter((r) => r.date >= addDays(today, -28));
  const activeDays = last28.filter((r) => r.active === 1).length;
  const wl = weeklyLoad(ctx.data, ctx.acts, ctx.workouts, today, 12);
  const recent4 = wl.slice(-5, -1); // 4 semanas completas
  const st = streaks(ctx.data, today);
  const prog = strengthProgress(ctx.workouts.filter((w) => w.session_date >= ctx.periodFrom));
  const records = exerciseRecords(ctx.workouts, today);
  const runs = runEfficiency(ctx.acts.filter((a) => a.activity_date >= ctx.periodFrom));
  const tod = byTimeOfDay(ctx.data, ctx.acts.filter((a) => a.activity_date >= ctx.periodFrom), ctx.workouts.filter((w) => w.session_date >= ctx.periodFrom));
  const rpe = rpeDistribution(ctx.acts, ctx.workouts, ctx.periodFrom);
  const rpeN = rpe.reduce((s, x) => s + x, 0);
  const rpeAvg = rpeN ? rpe.reduce((s, x, i) => s + x * (i + 1), 0) / rpeN : null;

  // desempenho por dias de descanso antes
  const restBuckets = [0, 1, 2, 3].map((k) => {
    const v = ctx.rows
      .filter((r) => r.strengthScore != null && r.restBefore != null && (k === 3 ? r.restBefore >= 3 : r.restBefore === k))
      .map((r) => r.strengthScore as number);
    return { label: k === 3 ? "3+ dias" : k === 0 ? "nenhum" : `${k} dia${k > 1 ? "s" : ""}`, value: v.length >= 2 ? mean(v) : null, n: v.length };
  });

  // grade de consistência (12 semanas)
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, wd === 0 ? -6 : 1 - wd);
  const gridStart = addDays(monday, -77);
  const intensity = new Map<string, number>();
  for (const r of ctx.data.rows) if (r.active) intensity.set(r.date, (r.strength ? 1 : 0) + ((r.cardioMin ?? 0) > 0 ? 1 : 0));

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Dias ativos" value={activeDays} sub="últimos 28 dias" />
        <Stat label="Força/semana" value={num(mean(recent4.map((w) => w.strength)), 1)} sub="média 4 sem." />
        <Stat label="Cardio/semana" value={`${num(mean(recent4.map((w) => w.cardioMin)))} min`} sub="média 4 sem." />
        <Stat label="Kcal em treino" value={num(mean(recent4.map((w) => w.kcal)))} sub="por semana" />
        <Stat label="Semanas seguidas" value={st.weeks} sub="com 3+ dias ativos" tone={st.weeks >= 4 ? "ok" : undefined} />
        <Stat label="Esta semana" value={`${st.thisWeek} dia${st.thisWeek === 1 ? "" : "s"}`} sub="ativos" />
      </div>

      <SectionTitle>Treinos por semana · 12 semanas</SectionTitle>
      <div className="card">
        <StackedColumns
          names={["Musculação", "Cardio"]}
          items={wl.map((w) => ({
            label: `${Number(w.week.slice(8, 10))}/${Number(w.week.slice(5, 7))}`,
            a: w.strength,
            b: w.cardio,
            title: `Semana de ${formatDayShort(w.week)}: ${w.strength} musculação, ${w.cardio} cardio (${num(w.cardioMin)} min)`,
          }))}
        />
      </div>

      <SectionTitle>Consistência · 12 semanas</SectionTitle>
      <div className="card">
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <div className="grid grid-rows-7 gap-1 text-[9px] leading-[14px] text-muted">
            {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {Array.from({ length: 84 }, (_, i) => {
              const date = addDays(gridStart, i);
              const v = intensity.get(date) ?? 0;
              return (
                <span
                  key={date}
                  title={`${formatDayShort(date)}${v ? (v > 1 ? ": força + cardio" : ": treinou") : ""}`}
                  className="h-[14px] rounded-[3px]"
                  style={{
                    background: date > today ? "transparent" : v > 1 ? SINGLE : v ? "rgba(167,139,250,0.5)" : "var(--color-card-2)",
                  }}
                />
              );
            })}
          </div>
        </div>
        <p className="mt-2 flex items-center gap-3 text-[10px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(167,139,250,0.5)" }} /> 1 tipo
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SINGLE }} /> força + cardio
          </span>
        </p>
      </div>

      <SectionTitle>Evolução da musculação · {ctx.period} dias</SectionTitle>
      {prog.length === 0 ? (
        <Empty>Registre o mesmo treino (ex.: Treino A) pelo menos 2 vezes com as cargas para ver a evolução.</Empty>
      ) : (
        <div className="grid gap-2">
          {prog.map((g) => (
            <div key={g.name} className="card">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-semibold">{g.name}</p>
                {g.change != null && (
                  <p className={`shrink-0 text-sm font-semibold ${g.change > 0.02 ? "text-ok" : g.change < -0.02 ? "text-bad" : "text-muted"}`}>
                    {signed(g.change * 100)}% volume
                  </p>
                )}
              </div>
              <Sparkline values={g.pts.map((p) => p.value)} height={36} />
              <p className="text-[11px] text-muted">
                {g.pts.length} sessões · último {num(g.pts[g.pts.length - 1].value)} kg·rep · compara as 3 primeiras com as 3 últimas
              </p>
            </div>
          ))}
        </div>
      )}

      {records.length > 0 && (
        <>
          <SectionTitle>Força estimada por exercício</SectionTitle>
          <div className="card">
            <ul className="divide-y divide-line">
              {records.map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{r.name}</p>
                    <p className="text-[10px] text-muted">
                      recorde em {formatDayShort(r.bestDate)} · {r.sessions} sessões
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="inline-flex items-center gap-1 font-semibold">
                      <Trophy size={13} className="text-accent" /> {num(r.best)} kg
                    </p>
                    {r.change != null && (
                      <p className={`text-[10px] ${r.change > 0.01 ? "text-ok" : r.change < -0.01 ? "text-bad" : "text-muted"}`}>
                        {signed(r.change * 100)}% em 8 semanas
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-muted">1RM estimado (fórmula de Epley): quanto você levantaria em 1 repetição.</p>
          </div>
        </>
      )}

      {restBuckets.filter((b) => b.value != null).length >= 2 && (
        <>
          <SectionTitle>Descanso antes × volume do treino</SectionTitle>
          <div className="card">
            <Columns
              items={restBuckets.map((b) => ({
                label: b.label,
                value: b.value,
                display: b.value == null ? "" : `${num(b.value)}%`,
                highlight: b.value === Math.max(...restBuckets.map((x) => x.value ?? 0)),
                title: `${b.label} de descanso: ${b.value == null ? "poucos dados" : `${num(b.value)}% da média`} (${b.n} treinos)`,
              }))}
            />
            <p className="mt-1 text-[11px] text-muted">Volume do treino comparado com a sua média (100%) conforme os dias parados antes.</p>
          </div>
        </>
      )}

      {tod.some((t) => t.strengthN >= 2 || t.runN >= 2) && (
        <>
          <SectionTitle>Melhor horário para treinar</SectionTitle>
          <div className="card space-y-3">
            {tod.some((t) => t.strengthN >= 2) && (
              <div>
                <p className="mb-1 text-xs text-muted">Musculação (volume vs sua média)</p>
                <Columns
                  height={90}
                  items={tod.map((t) => ({
                    label: `${t.name} (${t.strengthN})`,
                    value: t.strengthN >= 2 ? t.strength : null,
                    display: t.strength == null ? "" : `${num(t.strength)}%`,
                    highlight: t.strength === Math.max(...tod.map((x) => (x.strengthN >= 2 ? (x.strength ?? 0) : 0))),
                  }))}
                />
              </div>
            )}
            {tod.some((t) => t.runN >= 2) && (
              <div>
                <p className="mb-1 text-xs text-muted">Corrida (velocidade vs sua média)</p>
                <Columns
                  height={90}
                  color={SERIES[1]}
                  items={tod.map((t) => ({
                    label: `${t.name} (${t.runN})`,
                    value: t.runN >= 2 ? t.run : null,
                    display: t.run == null ? "" : `${num(t.run)}%`,
                    highlight: t.run === Math.max(...tod.map((x) => (x.runN >= 2 ? (x.run ?? 0) : 0))),
                  }))}
                />
              </div>
            )}
            <p className="text-[10px] text-muted">Entre parênteses, quantos treinos em cada horário. Manhã até 12h, tarde até 18h.</p>
          </div>
        </>
      )}

      <SectionTitle>Corrida · {ctx.period} dias</SectionTitle>
      {runs.runs.length < 2 ? (
        <Empty>Com 2 ou mais corridas no Strava, o ritmo e a eficiência aparecem aqui.</Empty>
      ) : (
        <div className="card space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Corridas" value={runs.runs.length} sub={`${num(runs.runs.reduce((s, r) => s + r.km, 0), 1)} km`} />
            <Stat
              label="Ritmo médio"
              value={pace(mean(runs.runs.map((r) => r.pace)))}
              sub={runs.paceTrend == null ? "min/km" : `${runs.paceTrend < 0 ? "−" : "+"}${Math.round(Math.abs(runs.paceTrend) * 60)} s/km por mês`}
              tone={runs.paceTrend == null ? undefined : runs.paceTrend < -0.02 ? "ok" : runs.paceTrend > 0.02 ? "bad" : undefined}
            />
            <Stat
              label="Eficiência"
              value={runs.effAvg == null ? "–" : `${num(runs.effAvg, 2)}`}
              sub={runs.effTrend == null ? "m por batimento" : `${signed((runs.effTrend / (runs.effAvg || 1)) * 100, 1)}%/mês`}
              tone={runs.effTrend == null ? undefined : runs.effTrend > 0 ? "ok" : "bad"}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted">Ritmo por corrida (min/km · mais baixo = mais rápido)</p>
            <TrendChart
              dates={runs.runs.map((r) => r.date)}
              series={[
                { name: "Ritmo", color: SERIES[1], values: rolling(runs.runs.map((r) => r.pace), 3, 1), dots: runs.runs.map((r) => r.pace) },
              ]}
              digits={2}
              unit="min/km"
              height={130}
              label="Ritmo da corrida"
            />
          </div>
          {runs.runs.filter((r) => r.eff != null).length >= 3 && (
            <div>
              <p className="mb-1 text-xs text-muted">Eficiência aeróbica (metros por batimento · mais alto = melhor condicionamento)</p>
              <TrendChart
                dates={runs.runs.map((r) => r.date)}
                series={[
                  {
                    name: "Eficiência",
                    color: SERIES[2],
                    values: rolling(runs.runs.map((r) => r.eff), 3, 1),
                    dots: runs.runs.map((r) => r.eff),
                  },
                ]}
                digits={2}
                height={130}
                label="Eficiência aeróbica"
              />
            </div>
          )}
          <p className="text-[10px] text-muted">Cada ponto é uma corrida (em ordem). A linha é a média das últimas 3.</p>
        </div>
      )}

      {rpeN >= 3 && (
        <>
          <SectionTitle>Como você sente os treinos (RPE)</SectionTitle>
          <div className="card">
            <Columns
              height={90}
              items={rpe.map((v, i) => ({
                label: String(i + 1),
                value: v || null,
                display: v ? String(v) : "",
                highlight: i + 1 === Math.round(rpeAvg ?? 0),
                title: `Esforço ${i + 1}: ${v} treino(s)`,
              }))}
            />
            <p className="mt-1 text-[11px] text-muted">
              Esforço médio {num(rpeAvg, 1)}/10 em {rpeN} treinos.{" "}
              {rpeAvg != null && rpeAvg >= 8
                ? "Muitos treinos muito puxados: vale intercalar dias leves."
                : rpeAvg != null && rpeAvg <= 4
                  ? "Treinos leves na maior parte: dá para puxar mais em alguns."
                  : "Boa mistura de intensidade."}
            </p>
          </div>
        </>
      )}
    </>
  );
}
