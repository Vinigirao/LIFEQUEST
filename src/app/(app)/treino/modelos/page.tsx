import Link from "next/link";
import { ChevronLeft, X } from "lucide-react";
import { DeleteButton, SubmitButton } from "@/components/submit-button";
import { Empty, PageTitle, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { addTemplateExercise, createTemplate, deleteTemplate, removeTemplateExercise } from "../actions";
import { ExercisePicker } from "../exercise-picker";

type Item = {
  id: string;
  target_sets: number | null;
  target_reps: string | null;
  position: number;
  exercises: { name: string } | { name: string }[] | null;
};
type Template = { id: string; name: string; workout_template_exercises: Item[] };

const nameOf = (x: Item["exercises"]) => (Array.isArray(x) ? x[0]?.name : x?.name) ?? "";

export default async function ModelosPage() {
  const { supabase } = await requireUser();
  const [{ data: templates }, { data: exercises }] = await Promise.all([
    supabase
      .from("workout_templates")
      .select("id, name, workout_template_exercises(id, target_sets, target_reps, position, exercises(name))")
      .order("name"),
    supabase.from("exercises").select("id, name").order("name"),
  ]);
  const list = (templates ?? []) as Template[];

  return (
    <>
      <Link href="/treino" className="mb-2 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft size={16} /> Treinos
      </Link>
      <PageTitle title="Modelos de treino" subtitle="Ex.: Treino A, B, C" />

      <form action={createTemplate} className="card flex gap-2">
        <input name="name" className="input" placeholder="Nome do modelo" required />
        <SubmitButton className="btn btn-primary shrink-0">Criar</SubmitButton>
      </form>

      {list.length === 0 && (
        <div className="mt-4">
          <Empty>Crie um modelo para agilizar o registro dos treinos.</Empty>
        </div>
      )}

      {list.map((t) => {
        const items = [...t.workout_template_exercises].sort((a, b) => a.position - b.position);
        return (
          <section key={t.id}>
            <SectionTitle
              action={
                <form action={deleteTemplate}>
                  <input type="hidden" name="id" value={t.id} />
                  <DeleteButton className="text-xs text-bad">Apagar modelo</DeleteButton>
                </form>
              }
            >
              {t.name}
            </SectionTitle>
            <div className="card space-y-3">
              {items.length > 0 && (
                <ul className="space-y-1">
                  {items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between text-sm">
                      <span>{nameOf(i.exercises)}</span>
                      <span className="flex items-center gap-2 text-muted">
                        {i.target_sets ? `${i.target_sets}×` : ""}
                        {i.target_reps ?? ""}
                        <form action={removeTemplateExercise}>
                          <input type="hidden" name="id" value={i.id} />
                          <SubmitButton className="p-1" pendingText="…">
                            <X size={14} />
                          </SubmitButton>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <form action={addTemplateExercise} className="space-y-2 border-t border-line pt-3">
                <input type="hidden" name="template_id" value={t.id} />
                <ExercisePicker exercises={exercises ?? []} />
                <div className="grid grid-cols-3 gap-2">
                  <input name="target_sets" inputMode="numeric" className="input" placeholder="Séries" />
                  <input name="target_reps" className="input" placeholder="Reps (8-12)" />
                  <SubmitButton className="btn">Adicionar</SubmitButton>
                </div>
              </form>
            </div>
          </section>
        );
      })}
    </>
  );
}
