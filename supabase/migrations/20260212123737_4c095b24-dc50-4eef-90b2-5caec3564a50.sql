
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Table to store channel monitor results (keep last 10)
CREATE TABLE public.channel_monitor_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_live INTEGER NOT NULL DEFAULT 0,
  checked INTEGER NOT NULL DEFAULT 0,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.channel_monitor_results ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Anyone can read monitor results"
  ON public.channel_monitor_results
  FOR SELECT
  USING (true);
