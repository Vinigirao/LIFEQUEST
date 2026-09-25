-- =============================================================
-- LIFEQUEST · sincronização diária do Open Finance (Pluggy)
-- Roda todo dia às 07:00 de São Paulo (10:00 UTC).
-- Antes de rodar, troque SEU_CRON_SECRET pelo mesmo valor do CRON_SECRET da Vercel.
-- =============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'lifequest-pluggy';

select cron.schedule(
  'lifequest-pluggy',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://lifequest-sigma-pearl.vercel.app/api/cron/pluggy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SEU_CRON_SECRET'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
