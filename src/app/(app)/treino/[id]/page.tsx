import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import { DeleteButton, SubmitButton } from "@/components/submit-button";
import { PageTitle, SectionTitle, fmt } from "@/components/ui";
import { formatDayLong } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import { deleteSet, deleteWorkout, updateWorkout } from "../actions";
import { AddSetForm } from "./add-set-form";

type SetRow = {
  id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
};
type HistRow = Omit<SetRow, "id"> & { session_id: string };

type Named = { name: string } | { name: string }[] | null;
const nameOf = (x: Named) => (Array.isArray(x) ? x[0]?.name : x?.name) ?? "";

export default async function WorkoutSessionPage({ params }: PageProps<"/treino/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: session } = await supabase
    .from("workout_sessions")
    .select("id, name, session_date, notes, template_id")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();

  const [{ data: setsRaw }, { data: exercises }, { data: templateItems }, { data: history }] = await Promise.all([
    supabase
      .from("workout_sets")
      .select("id, exercise_id, set_number, weight_kg, reps")
      .eq("session_id", id)
      .order("created_at"),
    supabase.from("exercises").select("id, name").order("name"),
    session.template_id
      ? supabase
          .from("workout_template_exercises")
          .select("exercise_id, target_sets, target_reps, position, exercises(name)")
          .eq("template_id", session.template_id)
          .order("position")
      : Promise.resolve({ data: [] as { exercise_id: string; target_sets: number | null; target_reps: string | null; exercises: Named }[] }),
    supabase
      .from("workout_sets")
      .select("exercise_id, set_number, weight_kg, reps, session_id, created_at")
      .neq("session_id", id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const sets = (setsRaw ?? []) as SetRow[];
  const exList = (exercises ?? []) as { id: string; name: string }[];
  const exName = new Map(exList.map((e) => [e.id, e.name]));

  // Última sessão (anterior) de cada exercício
  const previous = new Map<string, HistRow[]>();
  const previousSession = new Map<string, string>();
  for (const h of (history ?? []) as HistRow[]) {
    const sid = previousSession.get(h.exercise_id);
    if (!sid) previousSession.set(h.exercise_id, h.session_id);
    if (!sid || sid === h.session_id) {
      previous.set(h.exercise_id, [...(previous.get(h.exercise_id) ?? []), h]);
    }
  }
  previous.forEach((list) => list.sort((a, b) => a.set_number - b.set_number));

  // Valor sugerido ao escolher um exercício: última série feita hoje, senão a melhor da última vez
  const last: Record<string, { weight: number; reps: number }> = {};
  previous.forEach((list, exId) => {
    const top = list.reduce((a, b) => (Number(b.weight_kg) > Number(a.weight_kg) ? b : a));
    last[exId] = { weight: Number(top.weight_kg), reps: top.reps };
  });
  for (const s of sets) last[s.exercise_id] = { weight: Number(s.weight_kg), reps: s.reps };

  // Agrupa séries por exercício, na ordem em que foram feitas
  const groups = new Map<string, SetRow[]>();
  for (const s of sets) groups.set(s.exercise_id, [...(groups.get(s.exercise_id) ?? []), s]);

  const pending = (templateItems ?? []).filter((t) => !groups.has(t.exercise_id));
  const volume = sets.reduce((sum, s) => sum + Number(s.weight_kg) * s.reps, 0);
  const defaultExerciseId = pending[0]?.exercise_id ?? sets.at(-1)?.exercise_id ?? exList[0]?.id;

  return (
    <>
      <Link href="/treino" className="mb-2 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft size={16} /> Treinos
      </Link>
      <PageTitle
        title={session.name}
        subtitle={`${formatDayLong(session.session_date)} · ${sets.length} séries · ${fmt(volume)} kg`}
      />

      {pending.length > 0 && (
        <div className="card mb-3">
          <p className="label">Faltam do modelo</p>
          <ul className="space-y-1 text-sm">
            {pending.map((p) => (
              <li key={p.exercise_id} className="flex justify-between">
                <span>{nameOf(p.exercises)}</span>
                <span className="text-muted">
                  {p.target_sets ? `${p.target_sets}×` : ""}
                  {p.target_reps ?? ""}
                  {last[p.exercise_id] ? ` · última: ${fmt(last[p.exercise_id].weight, 1)} kg` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AddSetForm sessionId={id} exercises={exList} defaultExerciseId={defaultExerciseId} last={last} />

      {[...groups.entries()].map(([exId, list]) => {
        const prev = previous.get(exId);
        return (
          <section key={exId}>
            <SectionTitle>{exName.get(exId)}</SectionTitle>
            <div className="card space-y-1 py-2">
              {list.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-muted">Série {s.set_number}</span>
                  <span className="font-semibold tabular-nums">
                    {fmt(Number(s.weight_kg), 2)} kg × {s.reps}
                  </span>
                  <form action={deleteSet}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="session_id" value={id} />
                    <SubmitButton className="p-1 text-muted" pendingText="…">
                      <X size={16} />
                    </SubmitButton>
                  </form>
                </div>
              ))}
              {prev && (
                <p className="border-t border-line pt-2 text-xs text-muted">
                  Última vez: {prev.map((p) => `${fmt(Number(p.weight_kg), 2)}×${p.reps}`).join(", ")}
                </p>
              )}
            </div>
          </section>
        );
      })}

      <SectionTitle>Detalhes</SectionTitle>
      <form action={updateWorkout} className="card space-y-3">
        <input type="hidden" name="id" value={id} />
        <div className="grid grid-cols-2 gap-2">
          <input name="name" defaultValue={session.name} className="input" aria-label="Nome" />
          <input type="date" name="date" defaultValue={session.session_date} className="input" aria-label="Data" />
        </div>
        <textarea name="notes" defaultValue={session.notes ?? ""} className="input" rows={3} placeholder="Observações" />
        <div className="flex gap-2">
          <SubmitButton className="btn btn-sm btn-primary">Salvar</SubmitButton>
          <DeleteButton className="btn btn-sm btn-danger ml-auto" formAction={deleteWorkout}>
            Apagar treino
          </DeleteButton>
        </div>
      </form>
    </>
  );
}
