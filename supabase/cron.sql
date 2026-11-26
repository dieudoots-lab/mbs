-- Relances automatiques toutes les 10 minutes, déclenchées par Supabase lui-même.
-- Utile si l'hébergement ne garde pas de processus allumé (ex. Vercel gratuit,
-- dont les tâches planifiées sont limitées à une par jour).
-- 1. Supabase > Database > Extensions : activez « pg_cron » et « pg_net ».
-- 2. Remplacez l'adresse du site et le secret (CRON_SECRET) ci-dessous, puis exécutez dans SQL Editor.

select cron.schedule(
  'mbs-relances',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://VOTRE-SITE/api/cron/relances',
    headers := jsonb_build_object('Authorization', 'Bearer VOTRE_CRON_SECRET')
  );
  $$
);

-- Pour arrêter : select cron.unschedule('mbs-relances');
