DROP POLICY IF EXISTS "Public read sellers (non-sensitive columns only)" ON public.sellers;
REVOKE ALL ON public.sellers FROM anon, authenticated, public;