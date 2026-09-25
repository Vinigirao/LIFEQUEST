-- =============================================================
-- LIFEQUEST · upgrade 2
-- Strava com FC/calorias e treino de força, percepção de esforço (RPE),
-- horário das refeições, perfil físico, finanças e análises.
--
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run.
-- Pode rodar mais de uma vez sem quebrar. Não apaga nenhum dado.
-- =============================================================

-- -------------------------------------------------------------
-- Atividades (Strava + manuais): mais detalhes
-- -------------------------------------------------------------
alter table public.cardio_sessions add column if not exists max_hr int;
alter table public.cardio_sessions add column if not exists calories int;
alter table public.cardio_sessions add column if not exists suffer_score int;
alter table public.cardio_sessions add column if not exists elapsed_min numeric(7, 2);
alter table public.cardio_sessions add column if not exists device_name text;
alter table public.cardio_sessions add column if not exists details_fetched boolean not null default false;
alter table public.cardio_sessions add column if not exists rpe smallint;

do $$ begin
  alter table public.cardio_sessions add constraint cardio_sessions_rpe_check check (rpe between 1 and 10);
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------
-- Treino de força: RPE, horário e vínculo com a atividade do Strava
-- -------------------------------------------------------------
alter table public.workout_sessions add column if not exists rpe smallint;
alter table public.workout_sessions add column if not exists started_at timestamptz;
alter table public.workout_sessions add column if not exists strava_activity_id uuid
  references public.cardio_sessions (id) on delete set null;

do $$ begin
  alter table public.workout_sessions add constraint workout_sessions_rpe_check check (rpe between 1 and 10);
exception when duplicate_object then null; end $$;

create unique index if not exists workout_sessions_strava_unique
  on public.workout_sessions (strava_activity_id) where strava_activity_id is not null;

-- -------------------------------------------------------------
-- Dieta: horário da refeição
-- -------------------------------------------------------------
alter table public.meal_logs add column if not exists eaten_at time;

-- -------------------------------------------------------------
-- Perfil físico (para estimar o gasto calórico)
-- -------------------------------------------------------------
alter table public.profiles add column if not exists height_cm numeric(5, 1);
alter table public.profiles add column if not exists birth_year int;
alter table public.profiles add column if not exists sex text;
alter table public.profiles add column if not exists weight_goal text;

do $$ begin
  alter table public.profiles add constraint profiles_sex_check check (sex in ('m', 'f'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_weight_goal_check check (weight_goal in ('perder', 'manter', 'ganhar'));
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------
-- Finanças
-- -------------------------------------------------------------
create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'despesa' check (kind in ('despesa', 'receita', 'neutro')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.finance_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pattern text not null,
  category_id uuid not null references public.finance_categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, pattern)
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tx_date date not null,
  description text not null,
  amount numeric(14, 2) not null,
  balance numeric(14, 2),
  category_id uuid references public.finance_categories (id) on delete set null,
  account text,
  source text,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (user_id, hash)
);
create index if not exists finance_transactions_date_idx on public.finance_transactions (user_id, tx_date desc);

create table if not exists public.finance_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  filename text,
  rows_new int not null default 0,
  rows_duplicated int not null default 0,
  imported_at timestamptz not null default now()
);

create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  snapshot_date date not null,
  asset_class text not null,
  gross numeric(14, 2),
  net numeric(14, 2),
  unique (user_id, snapshot_date, asset_class)
);

do $$
declare
  t text;
begin
  foreach t in array array['finance_categories', 'finance_rules', 'finance_transactions', 'finance_imports', 'net_worth_snapshots']
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
-- Metas: nova métrica de despesas
-- -------------------------------------------------------------
alter table public.goals drop constraint if exists goals_metric_check;
alter table public.goals add constraint goals_metric_check check (metric in (
  'treinos', 'cardio_sessoes', 'cardio_minutos', 'cardio_km',
  'kcal_media', 'proteina_media', 'carbo_media', 'gordura_media',
  'refeicoes_livres', 'diario_dias', 'fotos_dias', 'peso', 'despesas'
));

-- -------------------------------------------------------------
-- Categorias e regras iniciais de finanças (não duplica)
-- -------------------------------------------------------------
create or replace function public.seed_finance_defaults(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  r record;
begin
  for c in
    select * from (values
      ('Alimentação', 'despesa', 1), ('Mercado', 'despesa', 2), ('Transporte', 'despesa', 3),
      ('Moradia', 'despesa', 4), ('Contas e serviços', 'despesa', 5), ('Saúde', 'despesa', 6),
      ('Academia e esporte', 'despesa', 7), ('Lazer', 'despesa', 8), ('Bebida', 'despesa', 9),
      ('Erva', 'despesa', 10), ('Compras', 'despesa', 11), ('Assinaturas', 'despesa', 12),
      ('Viagem', 'despesa', 13), ('Pet', 'despesa', 14), ('Impostos e taxas', 'despesa', 15),
      ('Outros gastos', 'despesa', 16),
      ('Salário', 'receita', 20), ('Rendimentos', 'receita', 21), ('Outras entradas', 'receita', 22),
      ('Investimentos', 'neutro', 30), ('Transferência entre contas', 'neutro', 31)
    ) as v(name, kind, position)
  loop
    insert into public.finance_categories (user_id, name, kind, position)
    values (uid, c.name, c.kind, c.position)
    on conflict (user_id, name) do nothing;
  end loop;

  for r in
    select * from (values
      ('IFOOD', 'Alimentação'), ('RAPPI', 'Alimentação'), ('RESTAURANTE', 'Alimentação'), ('LANCHONETE', 'Alimentação'),
      ('PADARIA', 'Alimentação'), ('SUPERMERCADO', 'Mercado'), ('MERCADO', 'Mercado'), ('CARREFOUR', 'Mercado'),
      ('PAO DE ACUCAR', 'Mercado'), ('HORTIFRUTI', 'Mercado'), ('UBER', 'Transporte'), ('99APP', 'Transporte'),
      ('99 POP', 'Transporte'), ('BIKE ITAU', 'Transporte'), ('TEMBICI', 'Transporte'), ('METRO', 'Transporte'),
      ('ALUGUEL', 'Moradia'), ('CONDOMINIO', 'Moradia'), ('ENEL', 'Contas e serviços'), ('SABESP', 'Contas e serviços'),
      ('VIVO', 'Contas e serviços'), ('CLARO', 'Contas e serviços'), ('FARMACIA', 'Saúde'), ('DROGASIL', 'Saúde'),
      ('RAIA', 'Saúde'), ('SMART FIT', 'Academia e esporte'), ('TOTALPASS', 'Academia e esporte'),
      ('WELLHUB', 'Academia e esporte'), ('GYMPASS', 'Academia e esporte'), ('DECATHLON', 'Academia e esporte'),
      ('NETFLIX', 'Assinaturas'), ('SPOTIFY', 'Assinaturas'), ('AMAZON PRIME', 'Assinaturas'), ('YOUTUBE', 'Assinaturas'),
      ('ANTHROPIC', 'Assinaturas'), ('OPENAI', 'Assinaturas'), ('BAR ', 'Bebida'), ('CERVEJ', 'Bebida'),
      ('AMAZON', 'Compras'), ('MERCADOLIVRE', 'Compras'), ('MERCADO LIVRE', 'Compras'), ('SHOPEE', 'Compras'),
      ('PETZ', 'Pet'), ('COBASI', 'Pet'), ('LATAM', 'Viagem'), ('GOL LINHAS', 'Viagem'), ('AZUL LINHAS', 'Viagem'),
      ('AIRBNB', 'Viagem'), ('BOOKING', 'Viagem'),
      ('SALARIO', 'Salário'), ('PAGAMENTO DE SALARIO', 'Salário'),
      ('DIVIDENDOS', 'Rendimentos'), ('JUROS S/ CAPITAL', 'Rendimentos'), ('CUPOM', 'Rendimentos'),
      ('RENDIMENTO', 'Rendimentos'), ('TAXA REMUNERACAO', 'Rendimentos'),
      ('IR -', 'Impostos e taxas'), ('IOF', 'Impostos e taxas'), ('CORRETAGEM', 'Impostos e taxas'),
      ('TARIFA', 'Impostos e taxas'), ('CUSTODIA', 'Impostos e taxas'),
      ('APLICACAO', 'Investimentos'), ('RESGATE', 'Investimentos'), ('VENCIMENTO', 'Investimentos'),
      ('COMPRA DE', 'Investimentos'), ('VENDA DE', 'Investimentos'), ('LIQ BOLSA', 'Investimentos'),
      ('TESOURO DIRETO', 'Investimentos'), ('AMORTIZACAO', 'Investimentos'), ('CDB', 'Investimentos'),
      ('LCA', 'Investimentos'), ('LCI', 'Investimentos'), ('CRIPTO', 'Investimentos'), ('FUNDO', 'Investimentos'),
      ('IRRF', 'Impostos e taxas'), ('EMOLUMENTOS', 'Impostos e taxas'), ('IOF SOBRE SALDO', 'Impostos e taxas'),
      ('JUROS SOBRE SALDO NEGATIVO', 'Impostos e taxas'), ('REEMBOLSO DE CUSTODIA', 'Rendimentos'),
      ('EMISSAO -', 'Investimentos'), ('COMPRA -', 'Investimentos'), ('VENDA -', 'Investimentos'),
      ('ENVIO TRANSFERENCIA - VINICIUS', 'Transferência entre contas'),
      ('RECEBIMENTO TRANSFERENCIA - VINICIUS', 'Transferência entre contas')
    ) as v(pattern, category)
  loop
    insert into public.finance_rules (user_id, pattern, category_id)
    select uid, r.pattern, fc.id
    from public.finance_categories fc
    where fc.user_id = uid and fc.name = r.category
    on conflict (user_id, pattern) do nothing;
  end loop;
end;
$$;

revoke execute on function public.seed_finance_defaults(uuid) from public, anon, authenticated;

-- Novos usuários recebem refeições, metas e finanças iniciais
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_user_defaults(new.id);
  perform public.seed_finance_defaults(new.id);
  return new;
end;
$$;

select public.seed_finance_defaults(id) from auth.users;
