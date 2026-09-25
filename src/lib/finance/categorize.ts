import { normalizeText } from "./parse";

export type Rule = { pattern: string; category_id: string };

/** Escolhe a categoria pela regra mais específica (padrão mais longo) contida na descrição. */
export function categorize(description: string, rules: Rule[]): string | null {
  const text = normalizeText(description);
  let best: Rule | null = null;
  for (const r of rules) {
    const p = normalizeText(r.pattern);
    if (p && text.includes(p) && (!best || p.length > normalizeText(best.pattern).length)) best = r;
  }
  return best?.category_id ?? null;
}

/** Sugestão de padrão para uma regra nova: a descrição sem números, datas e códigos. */
export function suggestPattern(description: string): string {
  const words = normalizeText(description)
    .replace(/\d+[\d/.,:-]*/g, " ")
    .replace(/[*#]/g, " ")
    .split(" ")
    .filter((w) => w.length > 1);
  return words.slice(0, 3).join(" ").trim() || normalizeText(description).slice(0, 20);
}

/** Identificador estável de um lançamento (para não duplicar ao importar o mesmo extrato de novo). */
export function txKey(date: string, description: string, amount: number, occurrence: number) {
  return `${date}|${normalizeText(description)}|${amount.toFixed(2)}|${occurrence}`;
}
