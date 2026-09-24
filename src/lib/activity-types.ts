/** Tipos de atividade (mesmos nomes do Strava) e rótulos em português. */
export const ACTIVITY_LABELS: Record<string, string> = {
  Run: "Corrida",
  TrailRun: "Trail",
  VirtualRun: "Corrida (esteira)",
  Walk: "Caminhada",
  Hike: "Trilha",
  Ride: "Bike",
  VirtualRide: "Bike indoor",
  EBikeRide: "E-bike",
  MountainBikeRide: "Mountain bike",
  GravelRide: "Gravel",
  Swim: "Natação",
  Tennis: "Tênis",
  Padel: "Padel",
  Squash: "Squash",
  Soccer: "Futebol",
  Rowing: "Remo",
  Elliptical: "Elíptico",
  StairStepper: "Escada",
  HighIntensityIntervalTraining: "HIIT",
  Yoga: "Yoga",
  Pilates: "Pilates",
  Workout: "Outro",
};

/** Opções do formulário manual */
export const MANUAL_TYPES = ["Run", "Walk", "Ride", "Swim", "Tennis", "Elliptical", "Rowing", "Workout"];

export function activityLabel(type: string) {
  return ACTIVITY_LABELS[type] ?? type;
}

/** Atividades em que faz sentido mostrar pace (min/km) */
export const PACE_TYPES = new Set(["Run", "TrailRun", "VirtualRun", "Walk", "Hike"]);

export function formatPace(durationMin: number, km: number | null) {
  if (!km || km <= 0) return null;
  const totalSec = Math.round((durationMin / km) * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function formatDuration(min: number) {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}
