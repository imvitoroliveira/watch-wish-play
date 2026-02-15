
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

-- No public access — only service_role (edge functions) can access
CREATE POLICY "No direct public access to api_keys"
  ON public.api_keys
  FOR ALL
  USING (false);
