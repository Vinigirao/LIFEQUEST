/** Percepção de esforço (RPE, escala 1 a 10) em 5 "reações". */
export const RPE_OPTIONS = [
  { value: 2, emoji: "😌", label: "Leve" },
  { value: 4, emoji: "🙂", label: "Moderado" },
  { value: 6, emoji: "😤", label: "Puxado" },
  { value: 8, emoji: "🥵", label: "Muito difícil" },
  { value: 10, emoji: "💀", label: "Máximo" },
] as const;

export function rpeOption(value: number | null | undefined) {
  if (value == null) return null;
  return RPE_OPTIONS.reduce((best, o) => (Math.abs(o.value - value) < Math.abs(best.value - value) ? o : best));
}
