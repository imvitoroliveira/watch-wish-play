
CREATE TABLE public.app_settings (
  id text PRIMARY KEY DEFAULT 'main',
  billing_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_settings" ON public.app_settings
  FOR SELECT USING (true);

INSERT INTO public.app_settings (id, billing_enabled) VALUES ('main', false);
