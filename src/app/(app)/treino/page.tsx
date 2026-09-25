import Link from "next/link";
import { ChevronRight, Flame, HeartPulse, ListChecks, Plus, Trophy } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { TrainingTabs } from "@/components/training-tabs";
import { Empty, SectionTitle, fmt } from "@/components/ui";
import { STRENGTH_TYPES, formatDuration } from "@/lib/activity-types";
import { addDays, formatDayShort, startOfWeek, todayISO } from "@/lib/dates";
import { rpeOption } from "@/lib/rpe";
import { requireUser } from "@/lib/supabase/server";
import { startWorkout, workoutFromStrava } from "./actions";

type Act = {
  id: string;
  name: string | null;
  activity_date: string;
  duration_min: number;
  avg_hr: number | null;
  calories: number | null;
};

type SessionRow = {
  id: string;
  session_date: string;
  name: string;
  rpe: number | null;
  strava_activity_id: string | null;
  workout_sets: { weight_kg: number; reps: number }[];
};

export default async function TreinoPage() {
  const { supabase } = await requireUser();
  const today = todayISO();

  const [{ data: templates }, { data: sessions }, { data: strengthActs }] = await Promise.all([
    supabase.from("workout_templates").select("id, name").order("name"),
    supabase
      .from("workout_sessions")
      .select("id, session_date, name, rpe, strava_activity_id, workout_sets(weight_kg, reps)")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("cardio_sessions")
      .select("id, name, activity_date, duration_min, avg_hr, calories")
      .in("activity_type", [...STRENGTH_TYPES])
      .gte("activity_date", addDays(today, -60))
      .order("activity_date", { ascending: false }),
  ]);

  const list = (sessions ?? []) as SessionRow[];
  const acts = (strengthActs ?? []) as Act[];
  const actById = new Map(acts.map((a) => [a.id, a]));
  const linkedIds = new Set(list.map((s) => s.strava_activity_id).filter(Boolean));
  const unlinked = acts.filter((a) => !linkedIds.has(a.id)).slice(0, 5);

  const weekStart = startOfWeek(today);
  const thisWeek =
    list.filter((s) => s.session_date >= weekStart).length + unlinked.filter((a) => a.activity_date >= weekStart).length;

  return (
    <>
      <TrainingTabs active="forca" />
      <p className="mb-3 text-sm text-muted">{thisWeek} treino(s) de força nesta semana</p>

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

      {unlinked.length > 0 && (
        <>
          <SectionTitle>Do Strava, sem cargas</SectionTitle>
          <ul className="space-y-2">
            {unlinked.map((a) => (
              <li key={a.id} className="card flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.name ?? "Musculação"}</p>
                  <p className="text-xs text-muted first-letter:uppercase">
                    {formatDayShort(a.activity_date)} · {formatDuration(Number(a.duration_min))}
                    {a.avg_hr ? ` · ${a.avg_hr} bpm` : ""}
                    {a.calories ? ` · ${a.calories} kcal` : ""}
                  </p>
                </div>
                <form action={workoutFromStrava}>
                  <input type="hidden" name="activity_id" value={a.id} />
                  <SubmitButton className="btn btn-sm shrink-0" pendingText="…">
                    <Plus size={14} /> Cargas
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">
            Já registrou as cargas num treino do mesmo dia? Abra o treino e toque em Vincular.
          </p>
        </>
      )}

      <SectionTitle>Histórico</SectionTitle>
      {list.length === 0 ? (
        <Empty>Nenhum treino registrado ainda.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((s) => {
            const volume = s.workout_sets.reduce((sum, x) => sum + Number(x.weight_kg) * x.reps, 0);
            const act = s.strava_activity_id ? actById.get(s.strava_activity_id) : undefined;
            const rpe = rpeOption(s.rpe);
            return (
              <li key={s.id}>
                <Link href={`/treino/${s.id}`} className="card flex items-center gap-3">
                  {rpe ? (
                    <span className="text-2xl" title={rpe.label}>
                      {rpe.emoji}
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-muted first-letter:uppercase">
                      {formatDayShort(s.session_date)} · {s.workout_sets.length} séries · {fmt(volume)} kg
                    </p>
                    {act && (act.avg_hr || act.calories) ? (
                      <p className="mt-0.5 flex gap-3 text-xs text-muted">
                        {act.avg_hr ? (
                          <span className="flex items-center gap-1">
                            <HeartPulse size={12} className="text-bad" /> {act.avg_hr} bpm
                          </span>
                        ) : null}
                        {act.calories ? (
                          <span className="flex items-center gap-1">
                            <Flame size={12} className="text-warn" /> {act.calories} kcal
                          </span>
                        ) : null}
                      </p>
                    ) : null}
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
