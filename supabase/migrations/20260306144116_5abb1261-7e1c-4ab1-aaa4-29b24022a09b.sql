
CREATE TABLE public.test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  run_at timestamp with time zone NOT NULL DEFAULT now(),
  total_tests integer NOT NULL DEFAULT 0,
  passed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  trigger_type text NOT NULL DEFAULT 'manual',
  results jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct public access to test_results" ON public.test_results FOR ALL USING (false);
