-- =============================================================
-- LIFEQUEST · agendador dos lembretes (rode DEPOIS do deploy na Vercel)
--
-- O que faz: a cada minuto o banco verifica se existe lembrete vencido.
-- Só quando existe, ele chama a rota /api/cron/reminders do app,
-- que envia o push e calcula o próximo horário.
--
-- Antes de rodar, troque os 2 valores abaixo:
--   SEU-APP.vercel.app  -> o domínio do seu app na Vercel
--   SEU_CRON_SECRET     -> o mesmo valor da variável CRON_SECRET na Vercel
-- =============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove a versão anterior do agendamento, se existir (seguro rodar de novo)
select cron.unschedule(jobid) from cron.job where jobname = 'lifequest-reminders';

select cron.schedule(
  'lifequest-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://SEU-APP.vercel.app/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SEU_CRON_SECRET'
    ),
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.reminders
    where active and next_run_at is not null and next_run_at <= now()
  );
  $$
);

-- Para conferir se está rodando:
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Para desligar:
--   select cron.unschedule('lifequest-reminders');
