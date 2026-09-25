import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categorize, type Rule } from "./finance/categorize";
import { detectMethod, parseInstallment } from "./finance/method";

/** Versão do formato dos dados. Ao subir, a próxima sincronização reprocessa 12 meses. */
const SYNC_VERSION = 2;

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
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    totalAmount?: number | null;
    purchaseDate?: string | null;
  } | null;
  paymentData?: { paymentMethod?: string | null } | null;
};

type PluggyBill = { id: string; dueDate: string; totalAmount: number };

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

/**
 * Lista lançamentos com paginação por cursor.
 * A Pluggy devolve em "next" o trecho a ser colado no fim do endereço (ex.: "?accountId=...&after=XYZ").
 */
async function listTransactions(accountId: string, from: string, to: string): Promise<PluggyTransaction[]> {
  const out: PluggyTransaction[] = [];
  let path = `/v2/transactions?${new URLSearchParams({ accountId, dateFrom: from, dateTo: to })}`;
  for (let i = 0; i < 60; i++) {
    const page: { results: PluggyTransaction[]; next?: string | null } = await pluggy(path);
    out.push(...(page.results ?? []));
    const next = page.next;
    if (!next) break;
    if (next.startsWith("?")) path = `/v2/transactions${next}`;
    else if (next.startsWith("/")) path = next;
    else if (next.startsWith("http")) path = next.replace(API, "");
    else path = `/v2/transactions?${new URLSearchParams({ accountId, dateFrom: from, dateTo: to, after: next })}`;
  }
  return out;
}

async function latestBill(accountId: string): Promise<PluggyBill | null> {
  try {
    const data = await pluggy<{ results?: PluggyBill[] } | PluggyBill[]>(`/bills?accountId=${encodeURIComponent(accountId)}`);
    const bills = Array.isArray(data) ? data : (data.results ?? []);
    return [...bills].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0] ?? null;
  } catch {
    return null;
  }
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

export type PluggySyncResult = { items: number; accounts: number; inserted: number; updated: number; errors: string[] };

/**
 * Busca contas e lançamentos de todas as conexões.
 * Primeira vez (ou após mudança de formato): últimos 12 meses. Depois: desde a última sincronização (−10 dias).
 * Lançamentos iguais (mesma data e valor) a extratos importados à mão são ignorados.
 * Lançamentos já existentes têm só os dados atualizados; a categoria que você escolheu é mantida.
 */
export async function syncPluggy(admin: SupabaseClient, userId: string): Promise<PluggySyncResult> {
  const { data: items } = await admin.from("pluggy_items").select("id, last_sync_at, sync_version").eq("user_id", userId);
  const { data: rulesRaw } = await admin.from("finance_rules").select("pattern, category_id").eq("user_id", userId);
  const rules = (rulesRaw ?? []) as Rule[];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in60 = new Date(now.getTime() + 60 * 86400_000).toISOString().slice(0, 10); // parcelas futuras do cartão
  const result: PluggySyncResult = { items: 0, accounts: 0, inserted: 0, updated: 0, errors: [] };

  for (const it of items ?? []) {
    try {
      await saveItem(admin, userId, it.id);
      const accounts = await listAccounts(it.id);
      const full = !it.last_sync_at || (it.sync_version ?? 1) < SYNC_VERSION;
      const from = full
        ? new Date(now.getTime() - 365 * 86400_000).toISOString().slice(0, 10)
        : new Date(new Date(it.last_sync_at).getTime() - 10 * 86400_000).toISOString().slice(0, 10);

      const { data: manual } = await admin
        .from("finance_transactions")
        .select("tx_date, amount")
        .eq("user_id", userId)
        .is("external_id", null)
        .gte("tx_date", from);
      const manualKeys = new Set((manual ?? []).map((m) => `${m.tx_date}|${Number(m.amount).toFixed(2)}`));

      for (const acc of accounts) {
        const card = isCard(acc);
        const bill = card ? await latestBill(acc.id) : null;
        const accountName = acc.marketingName || acc.name;
        await admin.from("pluggy_accounts").upsert({
          id: acc.id,
          user_id: userId,
          item_id: it.id,
          type: acc.type,
          subtype: acc.subtype,
          name: accountName,
          number: acc.number ?? null,
          balance: acc.balance ?? null,
          credit_limit: acc.creditData?.creditLimit ?? null,
          available_credit: acc.creditData?.availableCreditLimit ?? null,
          currency: acc.currencyCode ?? "BRL",
          bill_amount: bill?.totalAmount ?? null,
          bill_due_date: bill?.dueDate ? bill.dueDate.slice(0, 10) : null,
          updated_at: now.toISOString(),
        });
        result.accounts++;

        const txs = await listTransactions(acc.id, from, card ? in60 : today);
        const rows = txs
          .map((t) => {
            const description = (t.description || t.descriptionRaw || "Lançamento").replace(/\s+/g, " ").trim();
            // Cartão: positivo = compra. Guardamos sempre saída como negativo.
            const amount = Math.round((card ? -t.amount : t.amount) * 100) / 100;
            const meta = t.creditCardMetadata ?? null;
            const inst =
              meta?.totalInstallments && meta.totalInstallments > 1
                ? { n: meta.installmentNumber ?? 1, total: meta.totalInstallments }
                : card
                  ? parseInstallment(description)
                  : null;
            return {
              user_id: userId,
              tx_date: spDate(t.date),
              description,
              amount,
              balance: card ? null : (t.balance ?? null),
              account: accountName,
              pluggy_account_id: acc.id,
              source: "pluggy",
              external_id: t.id,
              status: t.status ?? null,
              provider_category: t.category ?? null,
              method: detectMethod(description, { isCard: card, paymentMethod: t.paymentData?.paymentMethod }),
              installment_number: inst?.n ?? null,
              total_installments: inst?.total ?? null,
              purchase_total: meta?.totalAmount ?? null,
              hash: `pluggy:${t.id}`,
            };
          })
          .filter((r) => r.amount !== 0 && !manualKeys.has(`${r.tx_date}|${r.amount.toFixed(2)}`));

        // Quais já existem?
        const existing = new Set<string>();
        for (let i = 0; i < rows.length; i += 200) {
          const { data } = await admin
            .from("finance_transactions")
            .select("hash")
            .eq("user_id", userId)
            .in(
              "hash",
              rows.slice(i, i + 200).map((r) => r.hash),
            );
          (data ?? []).forEach((d: { hash: string }) => existing.add(d.hash));
        }
        const fresh = rows
          .filter((r) => !existing.has(r.hash))
          .map((r) => ({ ...r, category_id: categorize(r.description, rules) }));
        const known = rows.filter((r) => existing.has(r.hash));

        for (let i = 0; i < fresh.length; i += 500) {
          const { data, error } = await admin
            .from("finance_transactions")
            .upsert(fresh.slice(i, i + 500), { onConflict: "user_id,hash", ignoreDuplicates: true })
            .select("id");
          if (error) throw new Error(error.message);
          result.inserted += data?.length ?? 0;
        }
        // Atualiza dados (status, parcela, forma de pagamento) sem mexer na categoria escolhida
        for (let i = 0; i < known.length; i += 500) {
          const chunk = known.slice(i, i + 500);
          const { error } = await admin.from("finance_transactions").upsert(chunk, { onConflict: "user_id,hash" });
          if (error) throw new Error(error.message);
          result.updated += chunk.length;
        }
      }

      await admin
        .from("pluggy_items")
        .update({ last_sync_at: now.toISOString(), last_error: null, sync_version: SYNC_VERSION })
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
