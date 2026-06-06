-- Ensure RLS is enabled on all sensitive tables (it already is, but explicit).
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_attempts ENABLE ROW LEVEL SECURITY;

-- Explicit deny policies. service_role bypasses RLS, so edge functions still
-- work; anon and authenticated roles are fully blocked.
DROP POLICY IF EXISTS "Deny all on users" ON public.users;
CREATE POLICY "Deny all on users" ON public.users
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all on master_admin" ON public.master_admin;
CREATE POLICY "Deny all on master_admin" ON public.master_admin
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all on admin_audit_log" ON public.admin_audit_log;
CREATE POLICY "Deny all on admin_audit_log" ON public.admin_audit_log
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all on seller_sessions" ON public.seller_sessions;
CREATE POLICY "Deny all on seller_sessions" ON public.seller_sessions
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- otp_attempts: keep existing admin SELECT, block all other operations
-- explicitly from anon and authenticated.
DROP POLICY IF EXISTS "Deny writes on otp_attempts" ON public.otp_attempts;
CREATE POLICY "Deny writes on otp_attempts" ON public.otp_attempts
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "Deny updates on otp_attempts" ON public.otp_attempts;
CREATE POLICY "Deny updates on otp_attempts" ON public.otp_attempts
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Deny deletes on otp_attempts" ON public.otp_attempts;
CREATE POLICY "Deny deletes on otp_attempts" ON public.otp_attempts
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- Revoke direct grants too, defense in depth.
REVOKE ALL ON public.users FROM anon, authenticated;
REVOKE ALL ON public.master_admin FROM anon, authenticated;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;
REVOKE ALL ON public.seller_sessions FROM anon, authenticated;