
-- Remove cron job
SELECT cron.unschedule('channel-monitor-every-2h');

-- Drop tables created for quality monitoring
DROP TABLE IF EXISTS public.canal_status;
DROP TABLE IF EXISTS public.channel_monitor_results;
