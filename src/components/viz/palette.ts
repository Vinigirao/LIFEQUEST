/**
 * Cores dos gráficos (validadas para daltonismo sobre o fundo escuro #14171c).
 * Série única usa a cor de destaque do app; várias séries usam SERIES na ordem, nunca em ciclo.
 */
export const SERIES = ["#3987e5", "#d95926", "#199e70"] as const;
export const SINGLE = "var(--color-accent)";

/** Divergente para correlação: laranja (negativa) · cinza (nada) · azul (positiva). */
const NEG = [217, 89, 38];
const MID = [56, 56, 53];
const POS = [57, 135, 229];

const mix = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

export function divergingColor(r: number, strength = 1) {
  const t = Math.min(1, Math.abs(r) / 0.7) * strength;
  return r >= 0 ? mix(MID, POS, t) : mix(MID, NEG, t);
}

/** Sequencial (um tom só, azul): do quase-fundo ao claro. */
const SEQ_LO = [27, 42, 64];
const SEQ_HI = [109, 167, 236];
export function sequentialColor(t: number) {
  return mix(SEQ_LO, SEQ_HI, Math.max(0, Math.min(1, t)));
}
