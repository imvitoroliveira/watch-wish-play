ALTER TABLE public.app_settings ALTER COLUMN billing_enabled SET DEFAULT true;
UPDATE public.app_settings SET billing_enabled = true, updated_at = now() WHERE id = 'main';
INSERT INTO public.app_settings (id, billing_enabled) VALUES ('main', true) ON CONFLICT (id) DO NOTHING;