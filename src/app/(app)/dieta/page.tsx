import Link from "next/link";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { DateNav, Empty, PageTitle, ProgressBar, SectionTitle, fmt } from "@/components/ui";
import { safeDate } from "@/lib/dates";
import { dailyNutritionTargets, type Goal } from "@/lib/goals";
import { requireUser } from "@/lib/supabase/server";
import { deleteMealLog, logManualMeal, logSavedMeal } from "./actions";

type Macro = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
type Log = Macro & { id: string; name: string; servings: number; is_free_meal: boolean };
type SavedMeal = { id: string; name: string; position: number; saved_meal_items: Macro[] };

const MACROS = [
  { key: "kcal", label: "Calorias", unit: "kcal", color: "var(--color-accent)" },
  { key: "protein_g", label: "Proteína", unit: "g", color: "#38bdf8" },
  { key: "carbs_g", label: "Carbo", unit: "g", color: "#f59e0b" },
  { key: "fat_g", label: "Gordura", unit: "g", color: "#f472b6" },
] as const;

function totals(list: Macro[]): Macro {
  return list.reduce(
    (t, m) => ({
      kcal: t.kcal + Number(m.kcal),
      protein_g: t.protein_g + Number(m.protein_g),
      carbs_g: t.carbs_g + Number(m.carbs_g),
      fat_g: t.fat_g + Number(m.fat_g),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

export default async function DietaPage({ searchParams }: PageProps<"/dieta">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const date = safeDate(typeof sp.d === "string" ? sp.d : undefined);

  const [{ data: logs }, { data: meals }, { data: goals }] = await Promise.all([
    supabase
      .from("meal_logs")
      .select("id, name, servings, kcal, protein_g, carbs_g, fat_g, is_free_meal")
      .eq("log_date", date)
      .order("logged_at"),
    supabase.from("saved_meals").select("id, name, position, saved_meal_items(kcal, protein_g, carbs_g, fat_g)").order("position"),
    supabase.from("goals").select("*").eq("active", true),
  ]);

  const dayLogs = (logs ?? []) as Log[];
  const day = totals(dayLogs);
  const t = dailyNutritionTargets((goals ?? []) as Goal[]);
  const targets: Record<keyof Macro, Goal | undefined> = { kcal: t.kcal, protein_g: t.protein, carbs_g: t.carbs, fat_g: t.fat };

  return (
    <>
      <PageTitle
        title="Dieta"
        action={
          <Link href="/dieta/refeicoes" className="btn btn-sm">
            <Settings2 size={14} /> Refeições
          </Link>
        }
      />
      <DateNav basePath="/dieta" date={date} />

      <div className="card space-y-3">
        {MACROS.map((m) => {
          const goal = targets[m.key];
          const value = day[m.key];
          return (
            <div key={m.key}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-muted">{m.label}</span>
                <span className="tabular-nums">
                  <span className="font-bold">{fmt(value)}</span>
                  <span className="text-muted">
                    {goal ? ` ${goal.direction === "lte" ? "≤" : "/"} ${fmt(Number(goal.target))}` : ""} {m.unit}
                  </span>
                </span>
              </div>
              <ProgressBar
                pct={goal ? value / Number(goal.target) : value > 0 ? 1 : 0}
                color={goal?.direction === "lte" && value > Number(goal.target) ? "var(--color-bad)" : m.color}
              />
            </div>
          );
        })}
        {!t.kcal && !t.protein && (
          <p className="text-xs text-muted">
            Defina metas de calorias e proteína em <Link href="/metas" className="text-accent">Metas</Link> para ver o
            progresso.
          </p>
        )}
      </div>

      <SectionTitle>Adicionar rápido</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {((meals ?? []) as SavedMeal[]).map((meal) => {
          const tot = totals(meal.saved_meal_items);
          return (
            <form key={meal.id} action={logSavedMeal}>
              <input type="hidden" name="saved_meal_id" value={meal.id} />
              <input type="hidden" name="date" value={date} />
              <SubmitButton className="card flex h-full w-full flex-col items-start text-left active:scale-[0.98]" pendingText="Adicionando...">
                <span className="flex w-full items-center justify-between font-semibold">
                  {meal.name} <Plus size={16} className="text-accent" />
                </span>
                <span className="mt-1 text-xs text-muted">
                  {fmt(tot.kcal)} kcal · P {fmt(tot.protein_g)} · C {fmt(tot.carbs_g)} · G {fmt(tot.fat_g)}
                </span>
              </SubmitButton>
            </form>
          );
        })}
        <form action={logManualMeal}>
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="is_free_meal" value="1" />
          <SubmitButton className="card flex h-full w-full flex-col items-start text-left" pendingText="Adicionando...">
            <span className="flex w-full items-center justify-between font-semibold">
              Refeição livre <Plus size={16} className="text-warn" />
            </span>
            <span className="mt-1 text-xs text-muted">sem contar macros</span>
          </SubmitButton>
        </form>
      </div>

      <details className="card mt-2">
        <summary className="cursor-pointer font-semibold">Outra refeição (manual)</summary>
        <form action={logManualMeal} className="mt-3 space-y-2">
          <input type="hidden" name="date" value={date} />
          <input name="name" className="input" placeholder="Nome (ex.: Almoço fora)" />
          <div className="grid grid-cols-4 gap-2">
            <input name="kcal" inputMode="decimal" className="input px-2" placeholder="kcal" />
            <input name="protein_g" inputMode="decimal" className="input px-2" placeholder="P (g)" />
            <input name="carbs_g" inputMode="decimal" className="input px-2" placeholder="C (g)" />
            <input name="fat_g" inputMode="decimal" className="input px-2" placeholder="G (g)" />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="is_free_meal" value="1" className="h-4 w-4 accent-violet-500" />
            Marcar como refeição livre
          </label>
          <SubmitButton>Adicionar</SubmitButton>
        </form>
      </details>

      <SectionTitle>Refeições do dia</SectionTitle>
      {dayLogs.length === 0 ? (
        <Empty>Nada registrado neste dia.</Empty>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {dayLogs.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2.5">
              <div className="flex-1">
                <p className="font-medium">
                  {l.name}
                  {Number(l.servings) !== 1 ? ` ×${fmt(Number(l.servings), 2)}` : ""}
                  {l.is_free_meal && <span className="ml-2 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn">LIVRE</span>}
                </p>
                <p className="text-xs text-muted">
                  {fmt(Number(l.kcal))} kcal · P {fmt(Number(l.protein_g))} · C {fmt(Number(l.carbs_g))} · G{" "}
                  {fmt(Number(l.fat_g))}
                </p>
              </div>
              <form action={deleteMealLog}>
                <input type="hidden" name="id" value={l.id} />
                <SubmitButton className="p-1 text-muted" pendingText="…">
                  <Trash2 size={16} />
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
