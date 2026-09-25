import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categorize, type Rule } from "./finance/categorize";

const API = "https://api.pluggy.ai";

export function pluggyConfigured() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

// ---------------------------------------------------------------- autenticação

let cachedKey: { key: string; expires: number } | null = null;

/** API Key da Pluggy (vale 2h; guardamos por 100 min). */
async function apiKey(): Promise<string> {
  if (cachedKey && cachedKey.expires > Date.now()) return cachedKey.key;
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET não configurados na Vercel");
  const res = await fetch(`${API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) throw new Error(`Pluggy recusou as credenciais (${res.status}). Confira Client ID/Secret.`);
  const data = (await res.json()) as { apiKey: string };
  cachedKey = { key: data.apiKey, expires: Date.now() + 100 * 60_000 };
  return data.apiKey;
}

async function pluggy<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-API-KEY": await apiKey(), ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401) cachedKey = null;
  if (!res.ok) throw new Error(`Pluggy ${path} respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ---------------------------------------------------------------- tipos

export type PluggyItem = {
  id: string;
  status: string;
  executionStatus?: string;
  lastUpdatedAt?: string | null;
  connector?: { id: number; name: string; imageUrl?: string };
};

type PluggyAccount = {
  id: string;
  itemId: string;
  type: "BANK" | "CREDIT" | string;
  subtype: string;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance?: number | null;
  currencyCode?: string;
  creditData?: { creditLimit?: number | null; availableCreditLimit?: number | null } | null;
};

type PluggyTransaction = {
  id: string;
  date: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  type: "DEBIT" | "CREDIT";
  status?: "PENDING" | "POSTED";
  category?: string | null;
  balance?: number | null;
};

// ---------------------------------------------------------------- chamadas

export async function createConnectToken(): Promise<string> {
  const data = await pluggy<{ accessToken: string }>("/connect_token", { method: "POST", body: "{}" });
  return data.accessToken;
}

export async function getItem(id: string) {
  return pluggy<PluggyItem>(`/items/${encodeURIComponent(id)}`);
}

async function listAccounts(itemId: string) {
  const data = await pluggy<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  return data.results ?? [];
}

async function listTransactions(accountId: string, from: string, to: string): Promise<PluggyTransaction[]> {
  const out: PluggyTransaction[] = [];
  let after: string | null = null;
  for (let i = 0; i < 40; i++) {
    const qs = new URLSearchParams({ accountId, dateFrom: from, dateTo: to });
    if (after) qs.set("after", after);
    const page: { results: PluggyTransaction[]; next?: string | null } = await pluggy(`/v2/transactions?${qs}`);
    out.push(...(page.results ?? []));
    if (!page.next) break;
    after = page.next;
  }
  return out;
}

// ---------------------------------------------------------------- sincronização

/** Data "AAAA-MM-DD" no horário de São Paulo (a Pluggy manda em UTC). */
function spDate(iso: string) {
  return new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

const isCard = (a: PluggyAccount) => a.type === "CREDIT" || a.subtype === "CREDIT_CARD";

/** Guarda (ou atualiza) uma conexão e suas contas. */
export async function saveItem(admin: SupabaseClient, userId: string, itemId: string) {
  const item = await getItem(itemId);
  await admin.from("pluggy_items").upsert({
    id: item.id,
    user_id: userId,
    connector_name: item.connector?.name ?? null,
    connector_image: item.connector?.imageUrl ?? null,
    status: item.status,
    last_updated_at: item.lastUpdatedAt ?? null,
  });
  return item;
}

export type PluggySyncResult = { items: number; accounts: number; inserted: number; errors: string[] };

/**
 * Busca contas e lançamentos de todas as conexões.
 * Primeira vez: últimos 12 meses. Depois: desde a última sincronização (com 10 dias de margem).
 * Lançamentos iguais (mesma data e valor) a um extrato importado manualmente são ignorados.
 */
export async function syncPluggy(admin: SupabaseClient, userId: string): Promise<PluggySyncResult> {
  const { data: items } = await admin.from("pluggy_items").select("id, last_sync_at").eq("user_id", userId);
  const { data: rulesRaw } = await admin.from("finance_rules").select("pattern, category_id").eq("user_id", userId);
  const rules = (rulesRaw ?? []) as Rule[];
  const today = new Date().toISOString().slice(0, 10);
  const result: PluggySyncResult = { items: 0, accounts: 0, inserted: 0, errors: [] };

  for (const it of items ?? []) {
    try {
      const item = await saveItem(admin, userId, it.id);
      const accounts = await listAccounts(it.id);
      const from = it.last_sync_at
        ? new Date(new Date(it.last_sync_at).getTime() - 10 * 86400_000).toISOString().slice(0, 10)
        : new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);

      // Lançamentos de extratos importados à mão no mesmo período (para não duplicar)
      const { data: manual } = await admin
        .from("finance_transactions")
        .select("tx_date, amount")
        .eq("user_id", userId)
        .is("external_id", null)
        .gte("tx_date", from);
      const manualKeys = new Set((manual ?? []).map((m) => `${m.tx_date}|${Number(m.amount).toFixed(2)}`));

      for (const acc of accounts) {
        const card = isCard(acc);
        await admin.from("pluggy_accounts").upsert({
          id: acc.id,
          user_id: userId,
          item_id: it.id,
          type: acc.type,
          subtype: acc.subtype,
          name: acc.marketingName || acc.name,
          number: acc.number ?? null,
          balance: acc.balance ?? null,
          credit_limit: acc.creditData?.creditLimit ?? null,
          available_credit: acc.creditData?.availableCreditLimit ?? null,
          currency: acc.currencyCode ?? "BRL",
          updated_at: new Date().toISOString(),
        });
        result.accounts++;

        const txs = await listTransactions(acc.id, from, today);
        const accountLabel = `${item.connector?.name ?? "Banco"} · ${acc.marketingName || acc.name}`;
        const rows = txs
          .map((t) => {
            // Cartão: positivo = compra. Guardamos sempre saída como negativo.
            const signed = card ? -t.amount : t.amount;
            const amount = Math.round(signed * 100) / 100;
            const date = spDate(t.date);
            return {
              user_id: userId,
              tx_date: date,
              description: (t.description || t.descriptionRaw || "Lançamento").replace(/\s+/g, " ").trim(),
              amount,
              balance: card ? null : (t.balance ?? null),
              category_id: categorize(t.description || t.descriptionRaw || "", rules),
              account: accountLabel,
              source: "pluggy",
              external_id: t.id,
              status: t.status ?? null,
              provider_category: t.category ?? null,
              hash: `pluggy:${t.id}`,
            };
          })
          .filter((r) => r.amount !== 0 && !manualKeys.has(`${r.tx_date}|${r.amount.toFixed(2)}`));

        for (let i = 0; i < rows.length; i += 500) {
          const { data, error } = await admin
            .from("finance_transactions")
            .upsert(rows.slice(i, i + 500), { onConflict: "user_id,hash", ignoreDuplicates: true })
            .select("id");
          if (error) throw new Error(error.message);
          result.inserted += data?.length ?? 0;
        }
      }

      await admin
        .from("pluggy_items")
        .update({ last_sync_at: new Date().toISOString(), last_error: null })
        .eq("id", it.id);
      result.items++;
    } catch (e) {
      const msg = (e as Error).message;
      result.errors.push(msg);
      await admin.from("pluggy_items").update({ last_error: msg.slice(0, 300) }).eq("id", it.id);
    }
  }
  return result;
}
