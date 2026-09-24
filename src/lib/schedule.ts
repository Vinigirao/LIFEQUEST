import { addDays, todayISO, weekday, zonedToUtc } from "./dates";

export type ReminderSchedule = {
  schedule_type: "once" | "daily" | "weekly";
  run_at: string | null;
  time_of_day: string | null; // "HH:MM" ou "HH:MM:SS"
  weekdays: number[] | null;
};

/**
 * Próximo disparo estritamente depois de `after`.
 * Devolve null quando não há próximo (lembrete único já passou).
 */
export function computeNextRun(r: ReminderSchedule, after: Date = new Date()): Date | null {
  if (r.schedule_type === "once") {
    if (!r.run_at) return null;
    const at = new Date(r.run_at);
    return at > after ? at : null;
  }

  if (!r.time_of_day) return null;
  const time = r.time_of_day.slice(0, 5);
  const allowed =
    r.schedule_type === "daily"
      ? [0, 1, 2, 3, 4, 5, 6]
      : (r.weekdays ?? []).filter((d) => d >= 0 && d <= 6);
  if (allowed.length === 0) return null;

  const startDay = todayISO(after);
  for (let i = 0; i <= 7; i++) {
    const day = addDays(startDay, i);
    if (!allowed.includes(weekday(day))) continue;
    const candidate = zonedToUtc(day, time);
    if (candidate > after) return candidate;
  }
  return null;
}

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function describeSchedule(r: ReminderSchedule): string {
  const time = r.time_of_day?.slice(0, 5) ?? "";
  if (r.schedule_type === "daily") return `Todo dia às ${time}`;
  if (r.schedule_type === "weekly") {
    const days = [...(r.weekdays ?? [])].sort().map((d) => WEEKDAY_LABELS[d]).join(", ");
    return `${days} às ${time}`;
  }
  return "Uma vez";
}
