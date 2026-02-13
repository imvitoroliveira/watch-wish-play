
-- Persistent cache for team badges (TheSportsDB de-para)
CREATE TABLE public.team_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_name text NOT NULL UNIQUE,
  badge_url text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'thesportsdb',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Allow edge functions to read via service role, frontend reads via anon
ALTER TABLE public.team_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read team badges"
ON public.team_badges
FOR SELECT
USING (true);

-- Index for fast lookups
CREATE INDEX idx_team_badges_name ON public.team_badges (team_name);
