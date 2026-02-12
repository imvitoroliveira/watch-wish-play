
-- Drop the permissive public read policies
DROP POLICY IF EXISTS "Anyone can read clients list" ON public.clients_list;
DROP POLICY IF EXISTS "Anyone can read m3u catalog" ON public.m3u_catalog;

-- Create restrictive policies: only service role (edge functions) can access
-- No public SELECT at all - all access goes through edge functions
CREATE POLICY "No direct public access to clients"
  ON public.clients_list FOR SELECT
  USING (false);

CREATE POLICY "No direct public access to m3u catalog"
  ON public.m3u_catalog FOR SELECT
  USING (false);
