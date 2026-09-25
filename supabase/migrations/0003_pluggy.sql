-- =============================================================
-- LIFEQUEST · Open Finance via Pluggy (Meu Pluggy)
-- Rode no Supabase: SQL Editor > New query > Run. Não apaga nada.
-- =============================================================

create table if not exists public.pluggy_items (
  id text primary key,                       -- Item ID da Pluggy (conexão)
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  connector_name text,
  connector_image text,
  status text,
  last_updated_at timestamptz,               -- última atualização feita pela Pluggy
  last_sync_at timestamptz,                  -- última vez que o LIFEQUEST buscou os dados
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.pluggy_accounts (
  id text primary key,                       -- Account ID da Pluggy
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id text not null references public.pluggy_items (id) on delete cascade,
  type text,                                 -- BANK | CREDIT
  subtype text,                              -- CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD
  name text,
  number text,
  balance numeric(14, 2),
  credit_limit numeric(14, 2),
  available_credit numeric(14, 2),
  currency text,
  updated_at timestamptz not null default now()
);

alter table public.finance_transactions add column if not exists external_id text;
alter table public.finance_transactions add column if not exists status text;
alter table public.finance_transactions add column if not exists provider_category text;
create index if not exists finance_transactions_external_idx on public.finance_transactions (external_id);

do $$
declare
  t text;
begin
  foreach t in array array['pluggy_items', 'pluggy_accounts']
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

-- Pagamento de fatura aparece na conta (saída) e no cartão (entrada): não é gasto nem receita
insert into public.finance_rules (user_id, pattern, category_id)
select c.user_id, p.pattern, c.id
from public.finance_categories c
cross join (values
  ('PAGAMENTO DE FATURA'), ('PAGAMENTO FATURA'), ('PAG FATURA'), ('PGTO FATURA'),
  ('PAGAMENTO RECEBIDO'), ('FATURA CARTAO'), ('PAGTO CARTAO')
) as p(pattern)
where c.name = 'Transferência entre contas'
on conflict (user_id, pattern) do nothing;
