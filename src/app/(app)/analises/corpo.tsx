import Link from "next/link";
import { Info } from "lucide-react";
import { IntakeChart } from "@/components/charts";
import { Empty, SectionTitle } from "@/components/ui";
import { Columns, SplitBar, Stat } from "@/components/viz/charts";
import { SERIES, SINGLE } from "@/components/viz/palette";
import { TrendChart } from "@/components/viz/trend-chart";
import { energyBalance, type Activity, type Meal, type Weight } from "@/lib/analytics";
import { addDays } from "@/lib/dates";
import { WEEKDAYS, macroSplit, mealTiming } from "@/lib/insights/patterns";
import { ewma, isNum, mean } from "@/lib/stats";
import { type Ctx, hourLabel, num, signed } from "./ctx";

export function Corpo({ ctx }: { ctx: Ctx }) {
  const { today, profile } = ctx;
  const meals: Meal[] = ctx.meals;
  const weights: Weight[] = ctx.weights.filter((w) => w.weight_kg != null).map((w) => ({ log_date: w.log_date, weight_kg: w.weight_kg as number }));
  const acts: Activity[] = ctx.acts;
  const eb = energyBalance(meals, weights, acts, profile, today);
  const last28 = Array.from({ length: 28 }, (_, i) => addDays(today, i - 28));
  const dayKcal = new Map<string, number>();
  for (const m of ctx.meals) dayKcal.set(m.log_date, (dayKcal.get(m.log_date) ?? 0) + m.kcal);
  const intakeDays = last28.map((d) => ({ date: d, kcal: dayKcal.get(d) ?? null }));
  const diff = eb.avgIntake != null && eb.targetKcal != null ? eb.avgIntake - eb.targetKcal : null;
  const goalLabel = { perder: "perder peso", manter: "manter o peso", ganhar: "ganhar massa" }[profile?.weight_goal ?? "manter"];

  // peso: pesagens + média suavizada (calculada no histórico todo, mostrada no período)
  const allRows = ctx.data.rows;
  const smooth = ewma(allRows.map((r) => r.weight), 0.15);
  const startIdx = allRows.findIndex((r) => r.date >= ctx.periodFrom);
  const pRows = allRows.slice(startIdx);
  const pSmooth = smooth.slice(startIdx);
  const pRaw = pRows.map((r) => r.weight);
  const weighIns = pRaw.filter(isNum).length;
  const waistRaw = pRows.map((r) => r.waist);
  const waistN = waistRaw.filter(isNum).length;
  const firstS = pSmooth.find(isNum);
  const lastS = [...pSmooth].reverse().find(isNum);

  // proteína
  const pDays = ctx.rows.filter((r) => r.protein != null);
  const hitDays = eb.proteinTarget ? pDays.filter((r) => (r.protein as number) >= eb.proteinTarget![0]).length : 0;
  const perKg = eb.avgProtein != null && eb.weightEnd ? eb.avgProtein / eb.weightEnd : null;
  const macros = macroSplit(ctx.rows);
  const timing = mealTiming(ctx.meals, ctx.periodFrom);
  const peak = timing.hist.indexOf(Math.max(...timing.hist));
  const freeDays = ctx.rows.filter((r) => r.freeMeal === 1).length;
  const loggedDays = ctx.rows.filter((r) => r.freeMeal != null).length;

  const wdKcal = WEEKDAYS.map((label, d) => {
    const v = ctx.rows.filter((r) => r.weekday === d && r.kcal != null).map((r) => r.kcal as number);
    return { label, value: v.length >= 2 ? mean(v) : null };
  });
  const wdMax = Math.max(...wdKcal.map((w) => w.value ?? 0));

  return (
    <>
      <SectionTitle>Balanço de energia · 28 dias</SectionTitle>
      <div className="card space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Comeu/dia" value={num(eb.avgIntake)} sub="kcal" />
          <Stat label="Gasta/dia" value={num(eb.tdee)} sub={eb.tdeeSource === "dados" ? "pelos seus dados" : eb.tdeeSource === "formula" ? "pela fórmula" : "kcal"} />
          <Stat label="Peso/semana" value={eb.weightPerWeek == null ? "–" : `${signed(eb.weightPerWeek, 2)}`} sub="kg" />
        </div>
        <IntakeChart days={intakeDays} target={eb.tdee} />
        {eb.targetKcal != null && diff != null && (
          <div
            className={`rounded-xl p-3 text-sm ${
              Math.abs(diff) <= 150 ? "bg-ok/10 text-ok" : Math.abs(diff) <= 400 ? "bg-warn/10 text-warn" : "bg-bad/10 text-bad"
            }`}
          >
            Para {goalLabel}, o ideal é cerca de <b>{num(eb.targetKcal)} kcal/dia</b>. Você está comendo{" "}
            <b>
              {num(Math.abs(diff))} kcal {diff > 0 ? "a mais" : "a menos"}
            </b>
            {Math.abs(diff) <= 150 ? ": está no ponto." : "."}
          </div>
        )}
        <p className="text-[11px] text-muted">
          {eb.adaptiveTdee != null && eb.formulaTdee != null
            ? `Pelos seus dados (comida × variação de peso) o gasto é ${num(eb.adaptiveTdee)} kcal; pela fórmula (metabolismo + ${num(eb.avgActiveKcal)} kcal/dia do Strava), ${num(eb.formulaTdee)} kcal. `
            : ""}
          Refeições livres ficam fora da média.
        </p>
        {eb.missing.length > 0 && (
          <div className="flex gap-2 rounded-xl bg-card-2 p-3 text-xs text-muted">
            <Info size={16} className="shrink-0 text-accent" />
            <span>
              Para uma estimativa melhor falta: {eb.missing.join("; ")}.{" "}
              {!eb.bmr && (
                <Link href="/config" className="text-accent">
                  Preencher perfil
                </Link>
              )}
            </span>
          </div>
        )}
      </div>

      <SectionTitle>Peso · {ctx.period} dias</SectionTitle>
      {weighIns < 2 ? (
        <Empty>Registre o peso em Fotos pelo menos 2 vezes para ver a curva.</Empty>
      ) : (
        <div className="card">
          <TrendChart
            dates={pRows.map((r) => r.date)}
            series={[{ name: "Tendência", color: SINGLE, values: pSmooth, dots: pRaw, width: 2.5 }]}
            unit="kg"
            digits={1}
            label="Peso ao longo do tempo"
          />
          <p className="mt-1 text-[11px] text-muted">
            Pontos: cada pesagem ({weighIns}). Linha: tendência suavizada, que tira o sobe-e-desce de água e sal.
            {firstS != null && lastS != null && (
              <>
                {" "}
                No período: <b className="text-fg">{signed(lastS - firstS, 1)} kg</b>.
              </>
            )}
          </p>
        </div>
      )}
      {waistN >= 2 && (
        <div className="card mt-2">
          <p className="mb-1 text-xs text-muted">Cintura (cm)</p>
          <TrendChart
            dates={pRows.map((r) => r.date)}
            series={[{ name: "Cintura", color: SINGLE, values: ewma(waistRaw, 0.3), dots: waistRaw }]}
            unit="cm"
            digits={1}
            height={120}
            label="Cintura ao longo do tempo"
          />
        </div>
      )}

      <SectionTitle>Proteína e macros · {ctx.period} dias</SectionTitle>
      {pDays.length < 3 ? (
        <Empty>Registre a dieta por alguns dias para ver seus macros.</Empty>
      ) : (
        <div className="card space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Proteína/dia" value={`${num(mean(pDays.map((r) => r.protein as number)))} g`} sub={perKg ? `${num(perKg, 1)} g/kg` : undefined} />
            <Stat
              label="Bateu a meta"
              value={eb.proteinTarget ? `${num((hitDays / pDays.length) * 100)}%` : "–"}
              sub={eb.proteinTarget ? `≥ ${num(eb.proteinTarget[0])} g` : "falta o peso"}
              tone={eb.proteinTarget ? (hitDays / pDays.length >= 0.7 ? "ok" : hitDays / pDays.length >= 0.4 ? "warn" : "bad") : undefined}
            />
            <Stat label="Refeição livre" value={loggedDays ? `${num((freeDays / loggedDays) * 7, 1)}` : "–"} sub="por semana" />
          </div>
          {macros && (
            <div>
              <p className="mb-1.5 text-xs text-muted">De onde vêm suas calorias</p>
              <SplitBar
                parts={[
                  { name: "Proteína", value: macros.protein, display: `${num(macros.protein * 100)}%` },
                  { name: "Carbo", value: macros.carbs, display: `${num(macros.carbs * 100)}%` },
                  { name: "Gordura", value: macros.fat, display: `${num(macros.fat * 100)}%` },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {wdKcal.filter((w) => w.value != null).length >= 4 && (
        <>
          <SectionTitle>Calorias por dia da semana</SectionTitle>
          <div className="card">
            <Columns
              items={wdKcal.map((w) => ({
                label: w.label,
                value: w.value,
                display: w.value == null ? "" : num(w.value / 1000, 1) + "k",
                highlight: w.value === wdMax,
                title: w.value == null ? `${w.label}: poucos dados` : `${w.label}: ${num(w.value)} kcal em média`,
              }))}
            />
            <p className="mt-1 text-[11px] text-muted">Média de kcal nos dias registrados (sem refeição livre). Destaque = dia em que mais come.</p>
          </div>
        </>
      )}

      <SectionTitle>Horário das refeições</SectionTitle>
      {timing.total < 5 ? (
        <Empty>Registre o horário das refeições na Dieta para ver seu padrão.</Empty>
      ) : (
        <div className="card space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="1ª refeição" value={hourLabel(timing.first)} sub="em média" />
            <Stat label="Última" value={hourLabel(timing.last)} sub="em média" />
            <Stat label="Janela" value={timing.window == null ? "–" : `${num(timing.window, 1)} h`} sub="comendo" />
          </div>
          <Columns
            height={90}
            color={SERIES[0]}
            items={timing.hist.slice(5, 24).map((v, i) => {
              const h = i + 5;
              return {
                label: h % 3 === 0 ? `${h}h` : "",
                value: v || null,
                display: h === peak ? String(v) : "",
                highlight: h === peak,
                title: `${h}h: ${v} refeição(ões)`,
              };
            })}
          />
          <p className="text-[11px] text-muted">
            Refeições por hora do dia. Pico às {peak}h. A relação do horário com treino e humor aparece em Relações.
          </p>
        </div>
      )}
    </>
  );
}
