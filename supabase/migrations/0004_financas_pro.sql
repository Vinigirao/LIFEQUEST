-- =============================================================
-- LIFEQUEST · Finanças pro
-- Forma de pagamento (cartão, Pix, débito...), parcelas, faturas,
-- metas de gastos com alerta. Rode no Supabase: SQL Editor > Run.
-- Não apaga nada e pode rodar mais de uma vez.
-- =============================================================

alter table public.finance_transactions add column if not exists method text;
alter table public.finance_transactions add column if not exists pluggy_account_id text;
alter table public.finance_transactions add column if not exists installment_number int;
alter table public.finance_transactions add column if not exists total_installments int;
alter table public.finance_transactions add column if not exists purchase_total numeric(14, 2);
create index if not exists finance_transactions_method_idx on public.finance_transactions (user_id, method, tx_date);

alter table public.pluggy_items add column if not exists sync_version int not null default 1;
alter table public.pluggy_accounts add column if not exists bill_amount numeric(14, 2);
alter table public.pluggy_accounts add column if not exists bill_due_date date;

-- Metas de gastos (orçamentos mensais)
create table if not exists public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  scope text not null default 'total' check (scope in ('total', 'categoria', 'metodo', 'parcelado')),
  scope_value text,
  monthly_limit numeric(14, 2) not null,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Alertas já enviados (para não repetir o push no mesmo mês)
create table if not exists public.finance_budget_alerts (
  budget_id uuid not null references public.finance_budgets (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month text not null,
  level int not null,
  sent_at timestamptz not null default now(),
  primary key (budget_id, month, level)
);

do $$
declare
  t text;
begin
  foreach t in array array['finance_budgets', 'finance_budget_alerts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_own', t
    );
  end loop;
end;
$$;

-- -------------------------------------------------------------
-- Ajuste dos lançamentos que já vieram da Pluggy
-- -------------------------------------------------------------

-- Nome da conta sem o prefixo "MeuPluggy · " e vínculo com a conta
update public.finance_transactions t
set pluggy_account_id = pa.id,
    account = pa.name
from public.pluggy_accounts pa
join public.pluggy_items pi on pi.id = pa.item_id
where t.external_id is not null
  and t.pluggy_account_id is null
  and t.account = coalesce(pi.connector_name, 'Banco') || ' · ' || pa.name;

-- Forma de pagamento
update public.finance_transactions t
set method = 'cartao'
from public.pluggy_accounts pa
where t.pluggy_account_id = pa.id
  and (pa.type = 'CREDIT' or pa.subtype = 'CREDIT_CARD')
  and t.method is null;

update public.finance_transactions
set method = case
  when upper(description) ~ '\mPIX\M' then 'pix'
  when upper(description) ~ 'BOLETO|PAGAMENTO DE TITULO|PAGTO TITULO|CONVENIO' then 'boleto'
  when upper(description) ~ '\mTED\M|\mDOC\M|TRANSFER' then 'transferencia'
  when upper(description) ~ 'DEBITO|DÉBITO|COMPRA' then 'debito'
  else 'outro'
end
where method is null;

-- Na próxima sincronização, a Pluggy reenvia 12 meses com parcelas e forma de pagamento
update public.pluggy_items set sync_version = 1 where sync_version is null;
