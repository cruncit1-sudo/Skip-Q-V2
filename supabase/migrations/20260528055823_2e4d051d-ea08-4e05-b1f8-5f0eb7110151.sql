
-- Tighten user_analytics: writes only via service_role (analytics-orders edge function).
DROP POLICY IF EXISTS "user_analytics_public_write" ON public.user_analytics;
DROP POLICY IF EXISTS "Users insert own analytics" ON public.user_analytics;
REVOKE INSERT, UPDATE, DELETE ON public.user_analytics FROM anon, authenticated;
GRANT SELECT ON public.user_analytics TO anon, authenticated;
GRANT ALL ON public.user_analytics TO service_role;

-- Tighten user_spend: writes only via service_role (record-spend edge function).
DROP POLICY IF EXISTS "user_spend_public_write" ON public.user_spend;
REVOKE INSERT, UPDATE, DELETE ON public.user_spend FROM anon, authenticated;
GRANT SELECT ON public.user_spend TO anon, authenticated;
GRANT ALL ON public.user_spend TO service_role;

-- Belt-and-braces on payments: ensure no anon/authenticated write paths remain.
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;
GRANT ALL ON public.payments TO service_role;
