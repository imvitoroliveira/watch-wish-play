
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
