
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
