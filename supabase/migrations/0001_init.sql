-- =============================================================
-- LIFEQUEST · schema inicial (MVP)
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run.
-- Pode rodar mais de uma vez sem quebrar (usa "if not exists").
-- =============================================================

-- -------------------------------------------------------------
-- Perfil
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 1. Diário
-- -------------------------------------------------------------
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date date not null,
  content text not null default '',
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

-- -------------------------------------------------------------
-- 2. Lembretes + push
-- -------------------------------------------------------------
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  schedule_type text not null check (schedule_type in ('once', 'daily', 'weekly')),
  run_at timestamptz,            -- usado quando schedule_type = 'once'
  time_of_day time,              -- usado em 'daily' e 'weekly' (horário de São Paulo)
  weekdays smallint[],           -- usado em 'weekly' (0 = domingo ... 6 = sábado)
  active boolean not null default true,
  next_run_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders (next_run_at) where active;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 3. Treino (musculação)
-- -------------------------------------------------------------
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  muscle_group text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_id uuid not null references public.workout_templates (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position int not null default 0,
  target_sets int,
  target_reps text
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_date date not null,
  name text not null,
  template_id uuid references public.workout_templates (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists workout_sessions_date_idx on public.workout_sessions (user_id, session_date desc);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  set_number int not null default 1,
  weight_kg numeric(6, 2) not null default 0,
  reps int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists workout_sets_exercise_idx on public.workout_sets (exercise_id, created_at desc);
create index if not exists workout_sets_session_idx on public.workout_sets (session_id);

-- -------------------------------------------------------------
-- 4. Cardio (manual + Strava)
-- -------------------------------------------------------------
create table if not exists public.cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity_date date not null,
  started_at timestamptz,
  activity_type text not null,
  name text,
  duration_min numeric(7, 2) not null default 0,
  distance_km numeric(8, 3),
  avg_hr int,
  elevation_m numeric(7, 1),
  notes text,
  source text not null default 'manual' check (source in ('manual', 'strava')),
  strava_id bigint unique,
  created_at timestamptz not null default now()
);
create index if not exists cardio_sessions_date_idx on public.cardio_sessions (user_id, activity_date desc);

-- Tokens do Strava: o app lê/grava com a chave secreta (servidor).
-- O usuário logado só consegue ver e apagar a própria conexão.
create table if not exists public.strava_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  athlete_id bigint not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 6. Dieta
-- -------------------------------------------------------------
create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  saved_meal_id uuid not null references public.saved_meals (id) on delete cascade,
  name text not null,
  portion text,
  kcal numeric(7, 2) not null default 0,
  protein_g numeric(7, 2) not null default 0,
  carbs_g numeric(7, 2) not null default 0,
  fat_g numeric(7, 2) not null default 0,
  position int not null default 0
);

-- Cada registro guarda uma "foto" dos macros no momento do lançamento,
-- então editar uma refeição salva depois não muda o histórico.
create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  logged_at timestamptz not null default now(),
  name text not null,
  saved_meal_id uuid references public.saved_meals (id) on delete set null,
  servings numeric(4, 2) not null default 1,
  kcal numeric(7, 2) not null default 0,
  protein_g numeric(7, 2) not null default 0,
  carbs_g numeric(7, 2) not null default 0,
  fat_g numeric(7, 2) not null default 0,
  is_free_meal boolean not null default false,
  notes text
);
create index if not exists meal_logs_date_idx on public.meal_logs (user_id, log_date desc);

-- -------------------------------------------------------------
-- 8. Fotos + medidas
-- -------------------------------------------------------------
create table if not exists public.body_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5, 2),
  waist_cm numeric(5, 1),
  photo_path text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

-- -------------------------------------------------------------
-- 9. Metas
-- -------------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  metric text not null check (metric in (
    'treinos', 'cardio_sessoes', 'cardio_minutos', 'cardio_km',
    'kcal_media', 'proteina_media', 'carbo_media', 'gordura_media',
    'refeicoes_livres', 'diario_dias', 'fotos_dias', 'peso'
  )),
  target numeric(9, 2) not null,
  period text not null check (period in ('day', 'week', 'month')),
  direction text not null default 'gte' check (direction in ('gte', 'lte')),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- updated_at automático no diário
-- -------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists journal_entries_touch on public.journal_entries;
create trigger journal_entries_touch
  before update on public.journal_entries
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------
-- Segurança: cada usuário só enxerga as próprias linhas (RLS)
-- -------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'journal_entries', 'reminders', 'push_subscriptions',
    'exercises', 'workout_templates', 'workout_template_exercises',
    'workout_sessions', 'workout_sets', 'cardio_sessions',
    'saved_meals', 'saved_meal_items', 'meal_logs', 'body_logs', 'goals'
  ]
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

alter table public.profiles enable row level security;
drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.strava_connections enable row level security;
drop policy if exists strava_select_own on public.strava_connections;
create policy strava_select_own on public.strava_connections for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists strava_delete_own on public.strava_connections;
create policy strava_delete_own on public.strava_connections for delete to authenticated
  using (user_id = (select auth.uid()));

-- -------------------------------------------------------------
-- Storage: bucket privado para as fotos do corpo
-- Arquivos ficam em body-photos/<user_id>/<arquivo>.jpg
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('body-photos', 'body-photos', false)
on conflict (id) do nothing;

drop policy if exists body_photos_select on storage.objects;
create policy body_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists body_photos_insert on storage.objects;
create policy body_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'body-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists body_photos_update on storage.objects;
create policy body_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists body_photos_delete on storage.objects;
create policy body_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -------------------------------------------------------------
-- Dados iniciais por usuário: refeições salvas e metas de exemplo
-- Só insere se o usuário ainda não tiver nada (não duplica).
-- -------------------------------------------------------------
create or replace function public.seed_user_defaults(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m1 uuid;
  m2 uuid;
begin
  insert into public.profiles (id) values (uid) on conflict (id) do nothing;

  if not exists (select 1 from public.saved_meals where user_id = uid) then
    insert into public.saved_meals (user_id, name, position)
      values (uid, 'Refeição 1', 1) returning id into m1;
    insert into public.saved_meals (user_id, name, position)
      values (uid, 'Refeição 2', 2) returning id into m2;

    insert into public.saved_meal_items
      (user_id, saved_meal_id, name, portion, kcal, protein_g, carbs_g, fat_g, position)
    values
      (uid, m1, 'Frango', '200 g', 230, 46, 0, 5, 1),
      (uid, m1, 'Arroz', '50 g cru', 180, 4, 40, 0, 2),
      (uid, m1, 'Legumes', '200 g', 90, 6, 14, 1, 3),
      (uid, m1, 'Azeite', '1 fio', 45, 0, 0, 5, 4),
      (uid, m2, 'Whey', '30 g', 120, 24, 2, 2, 1),
      (uid, m2, 'Aveia', '30 g', 118, 4, 20, 2.5, 2),
      (uid, m2, 'Iogurte natural', '1 pote', 100, 6, 9, 5, 3),
      (uid, m2, 'Banana', '1 unidade', 100, 1, 23, 0.3, 4),
      (uid, m2, 'Pasta de amendoim', '15 g', 90, 3.8, 3, 7.5, 5);
  end if;

  if not exists (select 1 from public.goals where user_id = uid) then
    insert into public.goals (user_id, metric, target, period, direction, position)
    values
      (uid, 'treinos', 4, 'week', 'gte', 1),
      (uid, 'cardio_sessoes', 2, 'week', 'gte', 2),
      (uid, 'proteina_media', 140, 'week', 'gte', 3),
      (uid, 'refeicoes_livres', 2, 'week', 'lte', 4),
      (uid, 'diario_dias', 7, 'week', 'gte', 5),
      (uid, 'fotos_dias', 7, 'week', 'gte', 6);
  end if;
end;
$$;

revoke execute on function public.seed_user_defaults(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_user_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuários que já existiam antes deste script também recebem os dados iniciais
select public.seed_user_defaults(id) from auth.users;
