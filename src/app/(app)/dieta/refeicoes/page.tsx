import Link from "next/link";
import { ChevronLeft, X } from "lucide-react";
import { DeleteButton, SubmitButton } from "@/components/submit-button";
import { PageTitle, SectionTitle, fmt } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import {
  addSavedMealItem,
  createSavedMeal,
  deleteSavedMeal,
  deleteSavedMealItem,
  renameSavedMeal,
} from "../actions";

type Item = {
  id: string;
  name: string;
  portion: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  position: number;
};
type Meal = { id: string; name: string; saved_meal_items: Item[] };

export default async function RefeicoesPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("saved_meals")
    .select("id, name, saved_meal_items(id, name, portion, kcal, protein_g, carbs_g, fat_g, position)")
    .order("position");
  const meals = (data ?? []) as Meal[];

  return (
    <>
      <Link href="/dieta" className="mb-2 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft size={16} /> Dieta
      </Link>
      <PageTitle title="Refeições salvas" subtitle="Aparecem como atalho de um toque na aba Dieta" />

      {meals.map((meal) => {
        const items = [...meal.saved_meal_items].sort((a, b) => a.position - b.position);
        const tot = items.reduce(
          (t, i) => ({
            kcal: t.kcal + Number(i.kcal),
            p: t.p + Number(i.protein_g),
            c: t.c + Number(i.carbs_g),
            g: t.g + Number(i.fat_g),
          }),
          { kcal: 0, p: 0, c: 0, g: 0 },
        );
        return (
          <section key={meal.id}>
            <SectionTitle
              action={
                <form action={deleteSavedMeal}>
                  <input type="hidden" name="id" value={meal.id} />
                  <DeleteButton className="text-xs text-bad">Apagar</DeleteButton>
                </form>
              }
            >
              {meal.name}
            </SectionTitle>
            <div className="card space-y-3">
              <ul className="divide-y divide-line">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 py-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {i.name} {i.portion && <span className="text-muted">· {i.portion}</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {fmt(Number(i.kcal))} kcal · P {fmt(Number(i.protein_g), 1)} · C {fmt(Number(i.carbs_g), 1)} · G{" "}
                        {fmt(Number(i.fat_g), 1)}
                      </p>
                    </div>
                    <form action={deleteSavedMealItem}>
                      <input type="hidden" name="id" value={i.id} />
                      <SubmitButton className="p-1 text-muted" pendingText="…">
                        <X size={14} />
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              <p className="text-sm font-semibold">
                Total: {fmt(tot.kcal)} kcal · P {fmt(tot.p)} · C {fmt(tot.c)} · G {fmt(tot.g)}
              </p>

              <details className="border-t border-line pt-3">
                <summary className="cursor-pointer text-sm text-accent">Adicionar alimento</summary>
                <form action={addSavedMealItem} className="mt-3 space-y-2">
                  <input type="hidden" name="saved_meal_id" value={meal.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <input name="name" className="input" placeholder="Alimento" required />
                    <input name="portion" className="input" placeholder="Porção (ex.: 100 g)" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <input name="kcal" inputMode="decimal" className="input px-2" placeholder="kcal" />
                    <input name="protein_g" inputMode="decimal" className="input px-2" placeholder="P" />
                    <input name="carbs_g" inputMode="decimal" className="input px-2" placeholder="C" />
                    <input name="fat_g" inputMode="decimal" className="input px-2" placeholder="G" />
                  </div>
                  <SubmitButton className="btn btn-sm btn-primary">Adicionar</SubmitButton>
                </form>
              </details>

              <details>
                <summary className="cursor-pointer text-sm text-muted">Renomear</summary>
                <form action={renameSavedMeal} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={meal.id} />
                  <input name="name" defaultValue={meal.name} className="input" />
                  <SubmitButton className="btn shrink-0">Salvar</SubmitButton>
                </form>
              </details>
            </div>
          </section>
        );
      })}

      <SectionTitle>Nova refeição salva</SectionTitle>
      <form action={createSavedMeal} className="card flex gap-2">
        <input name="name" className="input" placeholder="Ex.: Refeição 3" required />
        <SubmitButton className="btn btn-primary shrink-0">Criar</SubmitButton>
      </form>
    </>
  );
}
