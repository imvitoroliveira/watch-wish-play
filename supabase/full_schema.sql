
-- Cache table for daily football API data
CREATE TABLE public.football_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_date DATE NOT NULL DEFAULT CURRENT_DATE,
  matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cache_date)
);

-- Enable RLS
ALTER TABLE public.football_cache ENABLE ROW LEVEL SECURITY;

-- Public read access (all users can view cached matches)
CREATE POLICY "Anyone can read football cache"
ON public.football_cache
FOR SELECT
USING (true);

-- Only service role can insert/update (via edge function)
-- No INSERT/UPDATE/DELETE policies for anon role = only service role can write

-- Table to cache M3U parsed titles (shared across all users)
CREATE TABLE public.m3u_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titles JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.m3u_catalog ENABLE ROW LEVEL SECURITY;

-- Everyone can read the catalog
CREATE POLICY "Anyone can read m3u catalog"
ON public.m3u_catalog FOR SELECT USING (true);

-- Insert a default row
INSERT INTO public.m3u_catalog (id, titles, source_url) 
VALUES ('00000000-0000-0000-0000-000000000001', '[]', null);

-- Create clients_list table for persistent client storage
CREATE TABLE public.clients_list (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clients jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clients_list ENABLE ROW LEVEL SECURITY;

-- Anyone can read (app needs to validate logins)
CREATE POLICY "Anyone can read clients list"
  ON public.clients_list
  FOR SELECT
  USING (true);

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

-- Table for real channel quality voting
CREATE TABLE public.canal_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_name TEXT NOT NULL UNIQUE,
  channel_group TEXT DEFAULT 'GERAL',
  votes_up INTEGER NOT NULL DEFAULT 0,
  votes_down INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.canal_status ENABLE ROW LEVEL SECURITY;

-- Anyone can read channel status
CREATE POLICY "Anyone can read canal_status"
  ON public.canal_status
  FOR SELECT
  USING (true);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.canal_status;

-- Remove cron job
SELECT cron.unschedule('channel-monitor-every-2h');

-- Drop tables created for quality monitoring
DROP TABLE IF EXISTS public.canal_status;
DROP TABLE IF EXISTS public.channel_monitor_results;

-- Drop the permissive public read policies
DROP POLICY IF EXISTS "Anyone can read clients list" ON public.clients_list;
DROP POLICY IF EXISTS "Anyone can read m3u catalog" ON public.m3u_catalog;

-- Create restrictive policies: only service role (edge functions) can access
-- No public SELECT at all - all access goes through edge functions
CREATE POLICY "No direct public access to clients"
  ON public.clients_list FOR SELECT
  USING (false);

CREATE POLICY "No direct public access to m3u catalog"
  ON public.m3u_catalog FOR SELECT
  USING (false);

-- Table for storing push subscriptions per client device
CREATE TABLE public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_username text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_username, endpoint)
);

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Block direct public access - only service role (edge functions) can access
CREATE POLICY "No direct public access to push subscriptions"
  ON public.user_push_subscriptions
  FOR ALL
  USING (false);

-- Table for notification history/queue
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'global' CHECK (type IN ('global', 'expiration', 'catalog', 'roleta')),
  title text NOT NULL,
  body text NOT NULL,
  target_user text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Block direct public access - edge functions handle all notification logic
CREATE POLICY "No direct public access to notifications"
  ON public.notifications
  FOR ALL
  USING (false);

-- Table for Cine-Trailer Challenge tracking
CREATE TABLE public.trailer_challenge (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_username text NOT NULL,
  challenge_date date NOT NULL DEFAULT CURRENT_DATE,
  trailers_watched integer NOT NULL DEFAULT 0,
  point_earned boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint: one record per user per day
ALTER TABLE public.trailer_challenge ADD CONSTRAINT unique_user_day UNIQUE (client_username, challenge_date);

-- Monthly completion tracking
CREATE TABLE public.trailer_challenge_completions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_username text NOT NULL,
  challenge_month text NOT NULL, -- format: YYYY-MM
  total_points integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.trailer_challenge_completions ADD CONSTRAINT unique_user_month UNIQUE (client_username, challenge_month);

-- Match reminders (replaces localStorage-based reminders)
CREATE TABLE public.match_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_username text NOT NULL,
  match_id integer NOT NULL,
  match_date timestamp with time zone NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  league_name text NOT NULL,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.match_reminders ADD CONSTRAINT unique_user_match UNIQUE (client_username, match_id);

-- Content arrival alerts ("Me Avise ao Chegar")
CREATE TABLE public.content_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_username text NOT NULL,
  movie_title text NOT NULL,
  movie_id integer NOT NULL,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.content_alerts ADD CONSTRAINT unique_user_content UNIQUE (client_username, movie_id);

-- Enable RLS on all tables
ALTER TABLE public.trailer_challenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trailer_challenge_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_alerts ENABLE ROW LEVEL SECURITY;

-- Block direct public access (all access via edge functions)
CREATE POLICY "No direct public access to trailer_challenge" ON public.trailer_challenge FOR ALL USING (false);
CREATE POLICY "No direct public access to trailer_challenge_completions" ON public.trailer_challenge_completions FOR ALL USING (false);
CREATE POLICY "No direct public access to match_reminders" ON public.match_reminders FOR ALL USING (false);
CREATE POLICY "No direct public access to content_alerts" ON public.content_alerts FOR ALL USING (false);

-- Enable pg_cron and pg_net for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- Table for user presence heartbeat
CREATE TABLE public.user_presence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_username text NOT NULL UNIQUE,
  last_seen timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS - restrict direct access, only edge functions with service role can write/read
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct public access to user_presence"
  ON public.user_presence
  FOR ALL
  USING (false);

-- Index for quick lookups on last_seen
CREATE INDEX idx_user_presence_last_seen ON public.user_presence (last_seen DESC);

-- Enable Realtime for football_cache table
ALTER PUBLICATION supabase_realtime ADD TABLE public.football_cache;

-- Tabela principal: jogos_ativos (fonte Ãºnica de verdade para o frontend)
CREATE TABLE public.jogos_ativos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_partida INTEGER NOT NULL,
  liga_nome TEXT NOT NULL DEFAULT '',
  liga_id INTEGER NOT NULL DEFAULT 0,
  liga_logo TEXT NOT NULL DEFAULT '',
  rodada TEXT,
  time_casa TEXT NOT NULL,
  time_fora TEXT NOT NULL,
  emblema_casa TEXT NOT NULL DEFAULT '',
  emblema_fora TEXT NOT NULL DEFAULT '',
  placar_casa INTEGER,
  placar_fora INTEGER,
  horario_inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'programado',
  elapsed INTEGER,
  transmissao TEXT[] NOT NULL DEFAULT '{}',
  data_jogo DATE NOT NULL DEFAULT CURRENT_DATE,
  fonte TEXT NOT NULL DEFAULT 'unknown',
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(id_partida, data_jogo)
);

-- Ãndices para queries rÃ¡pidas
CREATE INDEX idx_jogos_ativos_status ON public.jogos_ativos(status);
CREATE INDEX idx_jogos_ativos_data ON public.jogos_ativos(data_jogo);
CREATE INDEX idx_jogos_ativos_horario ON public.jogos_ativos(horario_inicio);

-- RLS: leitura pÃºblica, escrita apenas via service role
ALTER TABLE public.jogos_ativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read jogos_ativos"
  ON public.jogos_ativos FOR SELECT
  USING (true);

-- Limpar jogos de dias anteriores automaticamente (reusar cron existente ou adicionar)
-- NÃ£o precisa de INSERT/UPDATE/DELETE policies pois edge functions usam service_role_key

-- Table for API key rotation with cooldown management
CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_name text NOT NULL,
  api_key text NOT NULL,
  provider text NOT NULL DEFAULT 'rapidapi',
  status text NOT NULL DEFAULT 'active',  -- 'active' | 'cooldown'
  cooldown_until timestamp with time zone,
  last_used_at timestamp with time zone DEFAULT '2000-01-01T00:00:00Z',
  total_calls integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint on key_name
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_key_name_unique UNIQUE (key_name);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- No public access â€” only service_role (edge functions) can access
CREATE POLICY "No direct public access to api_keys"
  ON public.api_keys
  FOR ALL
  USING (false);

-- Atomic upsert function with advisory locks to prevent race conditions
CREATE OR REPLACE FUNCTION public.upsert_jogo_ativo(
  p_id_partida integer,
  p_liga_nome text,
  p_liga_id integer,
  p_liga_logo text,
  p_rodada text,
  p_time_casa text,
  p_time_fora text,
  p_emblema_casa text,
  p_emblema_fora text,
  p_placar_casa integer,
  p_placar_fora integer,
  p_horario_inicio timestamp with time zone,
  p_status text,
  p_elapsed integer,
  p_transmissao text[],
  p_data_jogo date,
  p_fonte text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Serialize access to this specific game record
  PERFORM pg_advisory_xact_lock(hashtext('jogo_' || p_id_partida::text || '_' || p_data_jogo::text));

  INSERT INTO jogos_ativos (
    id_partida, liga_nome, liga_id, liga_logo, rodada,
    time_casa, time_fora, emblema_casa, emblema_fora,
    placar_casa, placar_fora, horario_inicio, status, elapsed,
    transmissao, data_jogo, fonte, atualizado_em
  ) VALUES (
    p_id_partida, p_liga_nome, p_liga_id, p_liga_logo, p_rodada,
    p_time_casa, p_time_fora, p_emblema_casa, p_emblema_fora,
    p_placar_casa, p_placar_fora, p_horario_inicio, p_status, p_elapsed,
    p_transmissao, p_data_jogo, p_fonte, now()
  )
  ON CONFLICT (id_partida, data_jogo) DO UPDATE SET
    liga_nome = EXCLUDED.liga_nome,
    liga_id = EXCLUDED.liga_id,
    liga_logo = EXCLUDED.liga_logo,
    rodada = EXCLUDED.rodada,
    time_casa = EXCLUDED.time_casa,
    time_fora = EXCLUDED.time_fora,
    emblema_casa = EXCLUDED.emblema_casa,
    emblema_fora = EXCLUDED.emblema_fora,
    placar_casa = EXCLUDED.placar_casa,
    placar_fora = EXCLUDED.placar_fora,
    horario_inicio = EXCLUDED.horario_inicio,
    status = EXCLUDED.status,
    elapsed = EXCLUDED.elapsed,
    transmissao = EXCLUDED.transmissao,
    fonte = EXCLUDED.fonte,
    atualizado_em = now();
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Table to store M3U update diffs (new titles per refresh)
CREATE TABLE public.m3u_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  new_titles jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_new integer NOT NULL DEFAULT 0,
  previous_count integer NOT NULL DEFAULT 0,
  current_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.m3u_updates ENABLE ROW LEVEL SECURITY;

-- Allow public read (clients see updates)
CREATE POLICY "Anyone can read m3u_updates"
  ON public.m3u_updates
  FOR SELECT
  USING (true);

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_username text NOT NULL,
  plan text NOT NULL,
  days integer NOT NULL,
  cakto_transaction_id text,
  status text NOT NULL DEFAULT 'pending',
  natv_activated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct public access to payment_transactions"
  ON public.payment_transactions
  AS RESTRICTIVE
  FOR ALL
  USING (false);

CREATE TABLE public.app_settings (
  id text PRIMARY KEY DEFAULT 'main',
  billing_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_settings" ON public.app_settings
  FOR SELECT USING (true);

INSERT INTO public.app_settings (id, billing_enabled) VALUES ('main', false);
CREATE POLICY "Allow public read m3u_updates" ON public.m3u_updates FOR SELECT USING (true);

CREATE TABLE public.test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  run_at timestamp with time zone NOT NULL DEFAULT now(),
  total_tests integer NOT NULL DEFAULT 0,
  passed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  trigger_type text NOT NULL DEFAULT 'manual',
  results jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct public access to test_results" ON public.test_results FOR ALL USING (false);
ALTER TABLE content_alerts ADD COLUMN IF NOT EXISTS original_title text DEFAULT '';
