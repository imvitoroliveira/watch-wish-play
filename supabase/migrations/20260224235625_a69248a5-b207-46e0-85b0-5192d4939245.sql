
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
