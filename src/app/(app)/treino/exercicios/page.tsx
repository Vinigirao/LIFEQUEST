import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Empty, PageTitle, SectionTitle, fmt } from "@/components/ui";
import { formatDayShort } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import { createExercise } from "../actions";

type SetRow = {
  exercise_id: string;
  weight_kg: number;
  reps: number;
  workout_sessions: { session_date: string } | { session_date: string }[] | null;
};

const dateOf = (x: SetRow["workout_sessions"]) => (Array.isArray(x) ? x[0]?.session_date : x?.session_date) ?? "";

/** 1RM estimado (fórmula de Epley) */
const epley = (w: number, r: number) => (r === 1 ? w : w * (1 + r / 30));

export default async function ExerciciosPage() {
  const { supabase } = await requireUser();
  const [{ data: exercises }, { data: sets }] = await Promise.all([
    supabase.from("exercises").select("id, name, muscle_group").order("name"),
    supabase.from("workout_sets").select("exercise_id, weight_kg, reps, workout_sessions(session_date)").limit(5000),
  ]);

  const stats = new Map<string, { best: number; bestReps: number; oneRm: number; lastDate: string; total: number }>();
  for (const s of (sets ?? []) as SetRow[]) {
    const w = Number(s.weight_kg);
    const cur = stats.get(s.exercise_id) ?? { best: 0, bestReps: 0, oneRm: 0, lastDate: "", total: 0 };
    if (w > cur.best || (w === cur.best && s.reps > cur.bestReps)) {
      cur.best = w;
      cur.bestReps = s.reps;
    }
    cur.oneRm = Math.max(cur.oneRm, epley(w, s.reps));
    const d = dateOf(s.workout_sessions);
    if (d > cur.lastDate) cur.lastDate = d;
    cur.total++;
    stats.set(s.exercise_id, cur);
  }

  const groups = new Map<string, { id: string; name: string }[]>();
  for (const e of exercises ?? []) {
    const g = e.muscle_group || "Sem grupo";
    groups.set(g, [...(groups.get(g) ?? []), e]);
  }

  return (
    <>
      <Link href="/treino" className="mb-2 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft size={16} /> Treinos
      </Link>
      <PageTitle title="Recordes" subtitle="Maior carga e 1RM estimado por exercício" />

      <form action={createExercise} className="card space-y-2">
        <p className="font-semibold">Novo exercício</p>
        <div className="grid grid-cols-2 gap-2">
          <input name="new_exercise" className="input" placeholder="Nome" required />
          <input name="muscle_group" className="input" placeholder="Grupo muscular" />
        </div>
        <SubmitButton>Cadastrar</SubmitButton>
      </form>

      {(exercises ?? []).length === 0 && (
        <div className="mt-4">
          <Empty>Nenhum exercício cadastrado.</Empty>
        </div>
      )}

      {[...groups.entries()].map(([group, list]) => (
        <section key={group}>
          <SectionTitle>{group}</SectionTitle>
          <ul className="card divide-y divide-line py-1">
            {list.map((e) => {
              const s = stats.get(e.id);
              return (
                <li key={e.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-muted first-letter:uppercase">
                      {s ? `${s.total} séries · última: ${formatDayShort(s.lastDate)}` : "sem séries ainda"}
                    </p>
                  </div>
                  {s && (
                    <div className="text-right">
                      <p className="font-bold tabular-nums">
                        {fmt(s.best, 2)} kg × {s.bestReps}
                      </p>
                      <p className="text-xs text-muted">1RM ≈ {fmt(s.oneRm, 1)} kg</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
