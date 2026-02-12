
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
