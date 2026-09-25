import { normalizeText } from "./parse";

export type Method = "cartao" | "pix" | "debito" | "boleto" | "transferencia" | "outro";

export const METHOD_LABEL: Record<Method, string> = {
  cartao: "Cartão de crédito",
  pix: "Pix",
  debito: "Débito",
  boleto: "Boleto",
  transferencia: "TED/transferência",
  outro: "Outros",
};

export const METHOD_SHORT: Record<Method, string> = {
  cartao: "Cartão",
  pix: "Pix",
  debito: "Débito",
  boleto: "Boleto",
  transferencia: "TED",
  outro: "Outros",
};

/** Como o dinheiro saiu/entrou, pelo tipo de conta, pelo dado da Pluggy ou pela descrição. */
export function detectMethod(description: string, opts: { isCard?: boolean; paymentMethod?: string | null } = {}): Method {
  if (opts.isCard) return "cartao";
  const pm = (opts.paymentMethod ?? "").toUpperCase();
  if (pm === "PIX") return "pix";
  if (pm === "BOLETO") return "boleto";
  if (pm === "TED" || pm === "DOC") return "transferencia";
  const d = normalizeText(description);
  if (/\bPIX\b/.test(d)) return "pix";
  if (/BOLETO|PAGAMENTO DE TITULO|PAGTO TITULO|CONVENIO/.test(d)) return "boleto";
  if (/\bTED\b|\bDOC\b|TRANSFERENCIA|TRANSF /.test(d)) return "transferencia";
  if (/DEBITO|COMPRA NO CARTAO|COMPRA CARTAO|\bCOMPRA\b/.test(d)) return "debito";
  return "outro";
}

/** "Parcela 2/10", "2 de 10", "PARC 02/10" na descrição. */
export function parseInstallment(description: string): { n: number; total: number } | null {
  const d = normalizeText(description);
  const m = d.match(/(?:PARC(?:ELA)?\.?\s*)?(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})(?!\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  const total = Number(m[2]);
  if (!(n >= 1 && total >= 2 && n <= total && total <= 48)) return null;
  // evita confundir datas "12/05": só aceita se tiver PARC ou se n <= total e total <= 24 com contexto
  if (!/PARC|\bDE\b/.test(d) && total > 24) return null;
  return { n, total };
}

/** Descrição sem o trecho da parcela (para agrupar as parcelas da mesma compra). */
export function baseDescription(description: string) {
  return normalizeText(description)
    .replace(/(?:PARC(?:ELA)?\.?\s*)?\d{1,2}\s*(?:\/|DE)\s*\d{1,2}(?!\d)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
