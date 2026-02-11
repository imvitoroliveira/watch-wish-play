
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
