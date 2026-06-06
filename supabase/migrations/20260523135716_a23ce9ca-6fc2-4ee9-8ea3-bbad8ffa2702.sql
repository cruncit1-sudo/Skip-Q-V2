-- 1) Fix seller_profiles privilege escalation: block status change by sellers
DROP POLICY IF EXISTS "Sellers update own profile" ON public.seller_profiles;
CREATE POLICY "Sellers update own profile (no status change)"
ON public.seller_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND status = (SELECT sp.status FROM public.seller_profiles sp WHERE sp.id = seller_profiles.id)
);

-- 2) Lock down admin_audit_log (service-role only via edge functions)
DROP POLICY IF EXISTS open_all_admin_audit_log ON public.admin_audit_log;
-- (no replacement policy = denied to anon/authenticated; service_role bypasses RLS)

-- 3) Lock down seller_sessions (service-role only)
DROP POLICY IF EXISTS open_all_seller_sessions ON public.seller_sessions;

-- 4) Tighten seller_offers: remove anon/auth write policies; keep public SELECT
DROP POLICY IF EXISTS "Active sellers can create offers" ON public.seller_offers;
DROP POLICY IF EXISTS "Active sellers can update offers" ON public.seller_offers;
DROP POLICY IF EXISTS "Active sellers can delete offers" ON public.seller_offers;
-- Public SELECT policy "Public view seller offers" remains in place.

-- 5) Revoke EXECUTE on internal SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.verify_master_admin(text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.verify_seller_password(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.hash_password(text) FROM anon, authenticated, public;
-- service_role retains EXECUTE so edge functions can still call them.