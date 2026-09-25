import { Empty, SectionTitle } from "@/components/ui";
import { Columns, CompareBars, RowHeat } from "@/components/viz/charts";
import { SERIES } from "@/components/viz/palette";
import { TrendChart } from "@/components/viz/trend-chart";
import { addDays } from "@/lib/dates";
import { WEEKDAYS, weekdayProfile } from "@/lib/insights/patterns";
import { isNum, mean, rolling } from "@/lib/stats";
import { type Ctx, num } from "./ctx";

const WEEKDAY_LONG = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const na = (day: string) => `${day === "sábado" || day === "domingo" ? "no" : "na"} ${day}`;

export function Rotina({ ctx }: { ctx: Ctx }) {
  const rows = ctx.rows;
  const moodN = rows.filter((r) => r.mood != null).length;
  const prof = weekdayProfile(rows);

  // frases da semana típica
  const notes: string[] = [];
  const pick = (key: string) => prof.find((m) => m.key === key);
  const extreme = (key: string, which: "max" | "min") => {
    const m = pick(key);
    if (!m) return null;
    const vals = m.values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] != null);
    if (vals.length < 4) return null;
    const best = vals.reduce((a, b) => ((which === "max" ? b[0] > a[0] : b[0] < a[0]) ? b : a));
    return { day: WEEKDAY_LONG[best[1]], value: m.fmt(best[0]) };
  };
  const moodHi = extreme("mood", "max");
  const moodLo = extreme("mood", "min");
  const spendHi = extreme("spend", "max");
  const kcalHi = extreme("kcal", "max");
  const trainLo = extreme("active", "min");
  if (moodHi && moodLo && moodHi.day !== moodLo.day) notes.push(`Seu humor costuma ser melhor ${na(moodHi.day)} (${moodHi.value}) e pior ${na(moodLo.day)} (${moodLo.value}).`);
  if (spendHi) notes.push(`Você gasta mais ${na(spendHi.day)} (R$ ${spendHi.value} em média).`);
  if (kcalHi) notes.push(`Come mais ${na(kcalHi.day)} (${kcalHi.value} kcal).`);
  if (trainLo) notes.push(`O dia em que menos treina é ${trainLo.day} (treina em ${trainLo.value} deles).`);

  // humor x treino
  const moodOf = (f: (r: (typeof rows)[number]) => boolean) => rows.filter((r) => r.mood != null && f(r)).map((r) => r.mood as number);
  const trained = moodOf((r) => r.active === 1);
  const rest = moodOf((r) => r.active === 0);
  const afterTrain = rows
    .filter((r) => r.mood != null && ctx.data.byDate.get(addDays(r.date, -1))?.active === 1)
    .map((r) => r.mood as number);
  const dist = [1, 2, 3, 4, 5].map((v) => rows.filter((r) => r.mood === v).length);

  return (
    <>
      <SectionTitle>Humor e energia · {ctx.period} dias</SectionTitle>
      {moodN < 3 ? (
        <Empty>Registre humor e energia no Diário (ou no Início) para ver a curva.</Empty>
      ) : (
        <div className="card">
          <TrendChart
            dates={rows.map((r) => r.date)}
            series={[
              { name: "Humor", color: SERIES[0], values: rolling(rows.map((r) => r.mood), 7, 2) },
              { name: "Energia", color: SERIES[1], values: rolling(rows.map((r) => r.energy), 7, 2) },
            ]}
            digits={1}
            yMin={1}
            yMax={5}
            label="Humor e energia ao longo do tempo"
          />
          <p className="mt-1 text-[11px] text-muted">
            Média dos últimos 7 dias (escala 1 a 5). Toque no gráfico para ver cada dia.
          </p>
        </div>
      )}

      <SectionTitle>Sua semana típica</SectionTitle>
      {prof.length === 0 ? (
        <Empty>Com algumas semanas de registros, o app mostra como cada dia da semana costuma ser.</Empty>
      ) : (
        <div className="card">
          {notes.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {notes.map((n) => (
                <li key={n} className="flex gap-2">
                  <span className="text-accent">•</span>
                  {n}
                </li>
              ))}
            </ul>
          )}
          <RowHeat
            cols={WEEKDAYS}
            rows={prof.map((m) => ({ label: m.label, values: m.values, display: m.values.map((v) => (v == null ? null : m.fmt(v))) }))}
          />
          <p className="mt-2 text-[10px] text-muted">
            Médias por dia da semana. Em cada linha, mais claro = maior valor daquela métrica.
          </p>
        </div>
      )}

      {trained.length >= 3 && rest.length >= 3 && (
        <>
          <SectionTitle>Treino e humor</SectionTitle>
          <div className="card">
            <CompareBars
              rows={[
                { label: "Dias com treino", value: mean(trained), display: num(mean(trained), 1), n: trained.length, strong: true },
                ...(afterTrain.length >= 3
                  ? [{ label: "Dia seguinte ao treino", value: mean(afterTrain), display: num(mean(afterTrain), 1), n: afterTrain.length, strong: true }]
                  : []),
                { label: "Dias sem treino", value: mean(rest), display: num(mean(rest), 1), n: rest.length },
              ]}
            />
            <p className="mt-2 text-[11px] text-muted">
              Humor médio (1 a 5). {trained.length} dias com treino e {rest.length} sem.
              {mean(trained) - mean(rest) >= 0.3
                ? " Você fica visivelmente melhor quando treina."
                : mean(rest) - mean(trained) >= 0.3
                  ? " Curiosamente, seu humor é melhor nos dias sem treino."
                  : " A diferença é pequena."}
            </p>
          </div>
        </>
      )}

      {dist.some((d) => d > 0) && (
        <>
          <SectionTitle>Como têm sido seus dias</SectionTitle>
          <div className="card">
            <Columns
              height={100}
              items={dist.map((v, i) => ({
                label: ["😣", "😕", "😐", "🙂", "😄"][i],
                value: v || null,
                display: v ? `${num((v / (moodN || 1)) * 100)}%` : "",
                highlight: v === Math.max(...dist),
                title: `Humor ${i + 1}: ${v} dia(s)`,
              }))}
            />
            <p className="mt-1 text-[11px] text-muted">
              {moodN} dias com humor registrado. Média {num(mean(rows.map((r) => r.mood).filter(isNum)), 1)}.
            </p>
          </div>
        </>
      )}
    </>
  );
}
