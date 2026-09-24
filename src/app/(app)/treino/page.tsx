import Link from "next/link";
import { ChevronRight, ListChecks, Trophy } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Empty, PageTitle, SectionTitle, fmt } from "@/components/ui";
import { formatDayShort, startOfWeek, todayISO } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import { startWorkout } from "./actions";

type SessionRow = {
  id: string;
  session_date: string;
  name: string;
  workout_sets: { weight_kg: number; reps: number }[];
};

export default async function TreinoPage() {
  const { supabase } = await requireUser();
  const today = todayISO();

  const [{ data: templates }, { data: sessions }] = await Promise.all([
    supabase.from("workout_templates").select("id, name").order("name"),
    supabase
      .from("workout_sessions")
      .select("id, session_date, name, workout_sets(weight_kg, reps)")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const list = (sessions ?? []) as SessionRow[];
  const weekStart = startOfWeek(today);
  const thisWeek = list.filter((s) => s.session_date >= weekStart).length;

  return (
    <>
      <PageTitle title="Treino" subtitle={`${thisWeek} treino(s) nesta semana`} />

      <form action={startWorkout} className="card space-y-3">
        <p className="font-semibold">Começar treino</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Modelo</label>
            <select name="template_id" className="input" defaultValue="">
              <option value="">Livre</option>
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Data</label>
            <input type="date" name="date" defaultValue={today} max={today} className="input" />
          </div>
        </div>
        <input name="name" className="input" placeholder="Nome (opcional, ex.: Peito e tríceps)" />
        <SubmitButton pendingText="Criando...">Começar</SubmitButton>
      </form>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/treino/modelos" className="btn">
          <ListChecks size={16} /> Modelos
        </Link>
        <Link href="/treino/exercicios" className="btn">
          <Trophy size={16} /> Recordes
        </Link>
      </div>

      <SectionTitle>Histórico</SectionTitle>
      {list.length === 0 ? (
        <Empty>Nenhum treino registrado ainda.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((s) => {
            const volume = s.workout_sets.reduce((sum, x) => sum + Number(x.weight_kg) * x.reps, 0);
            return (
              <li key={s.id}>
                <Link href={`/treino/${s.id}`} className="card flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-muted first-letter:uppercase">
                      {formatDayShort(s.session_date)} · {s.workout_sets.length} séries · {fmt(volume)} kg de volume
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
