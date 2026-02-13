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