import { strFromU8, unzipSync } from "fflate";

/**
 * Leitura de extratos: XLSX do BTG (aba "Conta Corrente" + "Sumário") e CSV genérico de bancos.
 * Sem dependências pesadas: o XLSX é um zip de XMLs, lido com fflate.
 */

export type ParsedTx = { date: string; description: string; amount: number; balance: number | null };
export type ParsedSnapshot = { date: string; assetClass: string; gross: number | null; net: number | null };
export type ParsedStatement = {
  source: "btg_xlsx" | "xlsx" | "csv";
  account: string | null;
  transactions: ParsedTx[];
  snapshots: ParsedSnapshot[];
};

type Cell = string | number | null;
type Sheet = { name: string; rows: Cell[][] };

// ---------------------------------------------------------------- utilidades

export function normalizeText(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Número em formato brasileiro ou americano: "1.234,56", "-R$ 12,00", "(45.10)", 12.3 */
export function parseAmount(v: Cell): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = v.trim();
  if (!s || s === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/R\$|\s/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Data do Excel (número serial) ou texto dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd → "aaaa-mm-dd" */
export function parseDate(v: Cell): string | null {
  if (v == null) return null;
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// ---------------------------------------------------------------- XLSX

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function colIndex(ref: string) {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(data: Uint8Array): Sheet[] {
  const files = unzipSync(data);
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : "");

  const shared: string[] = [];
  const sst = text("xl/sharedStrings.xml");
  for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    shared.push(parts.join(""));
  }

  const rels = new Map<string, string>();
  for (const m of text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)) {
    rels.set(m[1], m[2].replace(/^\/?xl\//, ""));
  }

  const sheets: Sheet[] = [];
  for (const m of text("xl/workbook.xml").matchAll(/<sheet[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    const target = rels.get(m[2]);
    if (!target) continue;
    const xml = text(`xl/${target}`);
    const rows: Cell[][] = [];
    for (const rowMatch of xml.matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const r = Number(rowMatch[1]) - 1;
      const row: Cell[] = [];
      for (const c of rowMatch[2].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] ?? "";
        const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
        if (!ref) continue;
        const type = attrs.match(/t="([^"]+)"/)?.[1];
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value: Cell = null;
        if (type === "s" && v != null) value = shared[Number(v)] ?? null;
        else if (type === "inlineStr") value = decodeXml(body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "");
        else if (type === "str" || type === "e") value = v != null ? decodeXml(v) : null;
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (v != null) value = Number(v);
        row[colIndex(ref)] = value;
      }
      rows[r] = row;
    }
    sheets.push({ name: decodeXml(m[1]), rows: Array.from(rows, (r) => r ?? []) });
  }
  return sheets;
}

// ---------------------------------------------------------------- tabelas genéricas

const HEADER_KEYS = {
  date: ["DATA", "DATE", "DT "],
  description: ["DESCRI", "HISTOR", "LANCAMENTO", "ESTABELECIMENTO", "TITLE", "MEMO", "DETALHE"],
  amount: ["VALOR", "AMOUNT", "QUANTIA", "MONTANTE", "MOVIMENTA"],
  balance: ["SALDO", "BALANCE"],
};

function findColumns(header: Cell[]) {
  const norm = Array.from(header, (h) => (typeof h === "string" ? normalizeText(h) : ""));
  const find = (keys: string[], exclude: number[] = []) =>
    norm.findIndex((h, i) => !exclude.includes(i) && keys.some((k) => h.startsWith(k) || h.includes(k)));
  const date = find(HEADER_KEYS.date);
  const description = find(HEADER_KEYS.description, [date]);
  const amount = find(HEADER_KEYS.amount, [date, description]);
  const balance = find(HEADER_KEYS.balance, [date, description, amount]);
  return { date, description, amount, balance };
}

function tableToTransactions(rows: Cell[][]): ParsedTx[] {
  const headerIdx = rows.findIndex((r) => {
    const c = findColumns(r);
    return c.date >= 0 && c.description >= 0 && c.amount >= 0;
  });
  if (headerIdx < 0) return [];
  const cols = findColumns(rows[headerIdx]);
  const out: ParsedTx[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const date = parseDate(r[cols.date] ?? null);
    const description = String(r[cols.description] ?? "").trim();
    const amount = parseAmount(r[cols.amount] ?? null);
    if (!date || !description || amount == null || amount === 0) continue;
    if (/^SALDO (ANTERIOR|FINAL|DO DIA)/.test(normalizeText(description))) continue;
    out.push({ date, description, amount, balance: cols.balance >= 0 ? parseAmount(r[cols.balance] ?? null) : null });
  }
  return out;
}

// ---------------------------------------------------------------- BTG

function btgSnapshots(sheet: Sheet | undefined): ParsedSnapshot[] {
  if (!sheet) return [];
  const headerIdx = sheet.rows.findIndex((r) => r.some((c) => typeof c === "string" && normalizeText(c) === "MERCADOS"));
  if (headerIdx < 0) return [];
  const header = sheet.rows[headerIdx];
  const start = header.findIndex((c) => typeof c === "string" && normalizeText(c) === "MERCADOS");
  const dateOf = (c: Cell) => (typeof c === "string" ? parseDate(c.match(/(\d{2}\/\d{2}\/\d{2,4})/)?.[1] ?? "") : null);
  const oldDate = dateOf(header[start + 1]);
  const newDate = dateOf(header[start + 3]);
  const out: ParsedSnapshot[] = [];
  for (const r of sheet.rows.slice(headerIdx + 1)) {
    const name = typeof r[start] === "string" ? String(r[start]).replace(/\*/g, "").trim() : "";
    if (!name) break;
    if (oldDate) out.push({ date: oldDate, assetClass: name, gross: parseAmount(r[start + 1]), net: parseAmount(r[start + 2]) });
    if (newDate) out.push({ date: newDate, assetClass: name, gross: parseAmount(r[start + 3]), net: parseAmount(r[start + 4]) });
    if (normalizeText(name) === "TOTAL") break;
  }
  return out;
}

function btgAccount(sheets: Sheet[]): string | null {
  const capa = sheets.find((s) => normalizeText(s.name) === "CAPA");
  const bank = capa?.rows.flat().find((c) => typeof c === "string" && c.startsWith("Banco:"));
  return bank ? String(bank).replace("Banco:", "").trim() : "BTG Pactual";
}

// ---------------------------------------------------------------- CSV

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function readCsv(text: string): Cell[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sample = lines.slice(0, 5).join("\n");
  const sep = [";", "\t", ","].sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  return lines.map((l) => splitCsvLine(l, sep));
}

function decodeText(data: Uint8Array) {
  const utf8 = new TextDecoder("utf-8").decode(data);
  // Arquivos de banco às vezes vêm em Latin-1: se aparecer o caractere de erro, decodifica de novo
  return utf8.includes("�") ? new TextDecoder("latin1").decode(data) : utf8;
}

// ---------------------------------------------------------------- entrada principal

export function parseStatement(data: Uint8Array, filename: string, invertSigns = false): ParsedStatement {
  const isZip = data[0] === 0x50 && data[1] === 0x4b; // "PK"
  let result: ParsedStatement;

  if (isZip) {
    const sheets = readXlsx(data);
    const conta = sheets.find((s) => normalizeText(s.name) === "CONTA CORRENTE");
    if (conta) {
      result = {
        source: "btg_xlsx",
        account: btgAccount(sheets),
        transactions: tableToTransactions(conta.rows),
        snapshots: btgSnapshots(sheets.find((s) => ["SUMARIO", "SUMÁRIO"].includes(normalizeText(s.name)))),
      };
    } else {
      const best = sheets
        .map((s) => tableToTransactions(s.rows))
        .sort((a, b) => b.length - a.length)[0];
      result = { source: "xlsx", account: null, transactions: best ?? [], snapshots: [] };
    }
  } else {
    const rows = readCsv(decodeText(data));
    // Fatura do Nubank (date,title,amount): valores positivos são gastos
    const header = Array.from(rows[0] ?? [], (c) => normalizeText(String(c ?? "")));
    const cardInvoice = header.includes("TITLE") && header.includes("AMOUNT");
    result = { source: "csv", account: null, transactions: tableToTransactions(rows), snapshots: [] };
    if (cardInvoice) invertSigns = !invertSigns;
  }

  if (invertSigns) result.transactions = result.transactions.map((t) => ({ ...t, amount: -t.amount }));
  if (!result.account) result.account = filename.replace(/\.[^.]+$/, "");
  return result;
}
