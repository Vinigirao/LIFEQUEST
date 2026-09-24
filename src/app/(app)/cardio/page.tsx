import { Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Empty, PageTitle, SectionTitle, fmt } from "@/components/ui";
import {
  MANUAL_TYPES,
  PACE_TYPES,
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
      .select("id, activity_date, activity_type, name, duration_min, distance_km, avg_hr, source")
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

  return (
    <>
      <PageTitle title="Cardio" subtitle="Apple Watch → Strava → LIFEQUEST" />

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
                ? `Conectado${conn.last_sync_at ? ` · última sincronização ${formatDateTime(conn.last_sync_at)}` : ""}`
                : "Importa corridas, bike, tênis etc. automaticamente"}
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

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="card p-3">
          <p className="text-xl font-bold">{week.length}</p>
          <p className="text-xs text-muted">sessões</p>
        </div>
        <div className="card p-3">
          <p className="text-xl font-bold">{formatDuration(weekMin)}</p>
          <p className="text-xs text-muted">tempo</p>
        </div>
        <div className="card p-3">
          <p className="text-xl font-bold">{fmt(weekKm, 1)}</p>
          <p className="text-xs text-muted">km</p>
        </div>
      </div>
      <p className="mt-1 text-center text-xs text-muted">nesta semana</p>

      <SectionTitle>Registrar manualmente</SectionTitle>
      <form action={addCardio} className="card space-y-3">
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
            <label className="label">Observação</label>
            <input name="notes" className="input" />
          </div>
        </div>
        <SubmitButton>Salvar</SubmitButton>
      </form>

      <SectionTitle>Histórico</SectionTitle>
      {list.length === 0 ? (
        <Empty>Nenhuma atividade ainda.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const pace = PACE_TYPES.has(r.activity_type) ? formatPace(r.duration_min, r.distance_km) : null;
            return (
              <li key={r.id} className="card flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {activityLabel(r.activity_type)}
                    {r.name && r.source === "strava" ? <span className="font-normal text-muted"> · {r.name}</span> : null}
                  </p>
                  <p className="text-xs text-muted first-letter:uppercase">
                    {formatDayShort(r.activity_date)} · {formatDuration(r.duration_min)}
                    {r.distance_km ? ` · ${fmt(r.distance_km, 2)} km` : ""}
                    {pace ? ` · ${pace}` : ""}
                    {r.avg_hr ? ` · ${r.avg_hr} bpm` : ""}
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
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
