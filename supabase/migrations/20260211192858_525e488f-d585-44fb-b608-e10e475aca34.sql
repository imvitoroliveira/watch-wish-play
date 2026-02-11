
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
