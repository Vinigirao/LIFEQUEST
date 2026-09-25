import type { Profile } from "@/lib/analytics";
import type { DailyData, DayRow, RawActivity, RawMeal, RawWeight, RawWorkout } from "@/lib/insights/daily";

export type Ctx = {
  today: string;
  period: number;
  periodFrom: string;
  data: DailyData;
  /** linhas do período escolhido */
  rows: DayRow[];
  meals: RawMeal[];
  acts: RawActivity[];
  workouts: RawWorkout[];
  weights: RawWeight[];
  profile: Profile | null;
  href: (p: Record<string, string | undefined>) => string;
  sp: { lag: 0 | 1; x: string; y: string; o: string };
};

export const num = (v: number | null | undefined, digits = 0) =>
  v == null || !Number.isFinite(v) ? "–" : v.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const brl = (v: number) => `R$ ${num(v)}`;

export const hourLabel = (h: number | null) => (h == null ? "–" : `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}`);

export const signed = (v: number, digits = 0) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), digits)}`;
