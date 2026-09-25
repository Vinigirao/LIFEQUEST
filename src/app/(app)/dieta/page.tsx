import Link from "next/link";
import { Settings2, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { DateNav, Empty, PageTitle, ProgressBar, SectionTitle, fmt } from "@/components/ui";
import { nowTimeSP, safeDate, todayISO } from "@/lib/dates";
import { dailyNutritionTargets, type Goal } from "@/lib/goals";
import { requireUser } from "@/lib/supabase/server";
import { deleteMealLog } from "./actions";
import { MealTime } from "./meal-time";
import { QuickAdd } from "./quick-add";

type Macro = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
type Log = Macro & { id: string; name: string; servings: number; is_free_meal: boolean; eaten_at: string | null };
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
      .select("id, name, servings, kcal, protein_g, carbs_g, fat_g, is_free_meal, eaten_at")
      .eq("log_date", date)
      .order("eaten_at", { ascending: true, nullsFirst: false })
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

      <SectionTitle>Adicionar</SectionTitle>
      <QuickAdd
        date={date}
        defaultTime={date === todayISO() ? nowTimeSP() : "12:00"}
        meals={((meals ?? []) as SavedMeal[]).map((meal) => {
          const tot = totals(meal.saved_meal_items);
          return { id: meal.id, name: meal.name, kcal: tot.kcal, p: tot.protein_g, c: tot.carbs_g, g: tot.fat_g };
        })}
      />

      <SectionTitle>Refeições do dia</SectionTitle>
      {dayLogs.length === 0 ? (
        <Empty>Nada registrado neste dia.</Empty>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {dayLogs.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2.5">
              <MealTime id={l.id} value={l.eaten_at} />
              <div className="min-w-0 flex-1">
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
