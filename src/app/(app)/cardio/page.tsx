import { Flame, HeartPulse, Trash2 } from "lucide-react";
import { RpePicker } from "@/components/rpe-picker";
import { SubmitButton } from "@/components/submit-button";
import { TrainingTabs } from "@/components/training-tabs";
import { Empty, SectionTitle, fmt } from "@/components/ui";
import {
  MANUAL_TYPES,
  PACE_TYPES,
  STRENGTH_TYPES,
  activityLabel,
  formatDuration,
  formatPace,
} from "@/lib/activity-types";
import { formatDateTime, formatDayShort, startOfWeek, todayISO } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import { addCardio, deleteCardio } from "./actions";
import { SyncButton } from "./sync-button";

type Cardio = {
  id: string;
  activity_date: string;
  activity_type: string;
  name: string | null;
  duration_min: number;
  distance_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  rpe: number | null;
  source: "manual" | "strava";
};

export default async function CardioPage({ searchParams }: PageProps<"/cardio">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const weekStart = startOfWeek(today);

  const [{ data: conn }, { data: rows }] = await Promise.all([
    supabase.from("strava_connections").select("athlete_id, last_sync_at").maybeSingle(),
    supabase
      .from("cardio_sessions")
      .select("id, activity_date, activity_type, name, duration_min, distance_km, avg_hr, max_hr, calories, rpe, source")
      .not("activity_type", "in", `(${[...STRENGTH_TYPES].join(",")})`)
      .order("activity_date", { ascending: false })
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(40),
  ]);

  const list = ((rows ?? []) as Cardio[]).map((r) => ({
    ...r,
    duration_min: Number(r.duration_min),
    distance_km: r.distance_km == null ? null : Number(r.distance_km),
  }));
  const week = list.filter((r) => r.activity_date >= weekStart);
  const weekMin = week.reduce((s, r) => s + r.duration_min, 0);
  const weekKm = week.reduce((s, r) => s + (r.distance_km ?? 0), 0);
  const weekKcal = week.reduce((s, r) => s + (r.calories ?? 0), 0);

  return (
    <>
      <TrainingTabs active="cardio" />

      {sp.strava === "ok" && <p className="mb-3 rounded-xl bg-ok/15 p-3 text-sm text-ok">Strava conectado.</p>}
      {sp.strava === "erro" && (
        <p className="mb-3 rounded-xl bg-bad/15 p-3 text-sm text-bad">Strava: {String(sp.motivo ?? "erro")}</p>
      )}

      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Strava</p>
            <p className="text-xs text-muted">
              {conn
                ? `Conectado${conn.last_sync_at ? ` · sincronizado ${formatDateTime(conn.last_sync_at)}` : ""}`
                : "Importa corridas, bike, tênis e musculação com FC e calorias"}
            </p>
          </div>
          {conn ? (
            <SyncButton />
          ) : (
            <a href="/api/strava/connect" className="btn btn-sm btn-primary shrink-0">
              Conectar
            </a>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          { v: String(week.length), l: "sessões" },
          { v: formatDuration(weekMin), l: "tempo" },
          { v: fmt(weekKm, 1), l: "km" },
          { v: fmt(weekKcal), l: "kcal" },
        ].map((x) => (
          <div key={x.l} className="card px-1 py-3">
            <p className="text-lg font-bold">{x.v}</p>
            <p className="text-[11px] text-muted">{x.l}</p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-center text-xs text-muted">nesta semana</p>

      <SectionTitle>Histórico</SectionTitle>
      {list.length === 0 ? (
        <Empty>Nenhuma atividade ainda.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const pace = PACE_TYPES.has(r.activity_type) ? formatPace(r.duration_min, r.distance_km) : null;
            return (
              <li key={r.id} className="card">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {activityLabel(r.activity_type)}
                      {r.name && r.source === "strava" ? <span className="font-normal text-muted"> · {r.name}</span> : null}
                    </p>
                    <p className="text-xs text-muted first-letter:uppercase">
                      {formatDayShort(r.activity_date)} · {formatDuration(r.duration_min)}
                      {r.distance_km ? ` · ${fmt(r.distance_km, 2)} km` : ""}
                      {pace ? ` · ${pace}` : ""}
                    </p>
                  </div>
                  {r.source === "strava" && (
                    <span className="rounded-md bg-[#fc4c02]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#fc4c02]">
                      STRAVA
                    </span>
                  )}
                  <form action={deleteCardio}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton className="p-1 text-muted" pendingText="…">
                      <Trash2 size={16} />
                    </SubmitButton>
                  </form>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex gap-3 text-xs text-muted">
                    {r.avg_hr ? (
                      <span className="flex items-center gap-1">
                        <HeartPulse size={13} className="text-bad" /> {r.avg_hr}
                        {r.max_hr ? `/${r.max_hr}` : ""} bpm
                      </span>
                    ) : null}
                    {r.calories ? (
                      <span className="flex items-center gap-1">
                        <Flame size={13} className="text-warn" /> {r.calories} kcal
                      </span>
                    ) : null}
                  </div>
                  <RpePicker kind="cardio" id={r.id} value={r.rpe} compact />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details className="card mt-4">
        <summary className="cursor-pointer font-semibold">Registrar manualmente</summary>
        <form action={addCardio} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Tipo</label>
              <select name="activity_type" className="input" defaultValue="Run">
                {MANUAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {activityLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Data</label>
              <input type="date" name="date" defaultValue={today} max={today} className="input" />
            </div>
            <div>
              <label className="label">Duração (min)</label>
              <input name="duration_min" inputMode="decimal" className="input" required />
            </div>
            <div>
              <label className="label">Distância (km)</label>
              <input name="distance_km" inputMode="decimal" className="input" />
            </div>
            <div>
              <label className="label">FC média</label>
              <input name="avg_hr" inputMode="numeric" className="input" />
            </div>
            <div>
              <label className="label">Calorias</label>
              <input name="calories" inputMode="numeric" className="input" />
            </div>
          </div>
          <input name="notes" className="input" placeholder="Observação" />
          <SubmitButton>Salvar</SubmitButton>
        </form>
      </details>
    </>
  );
}
