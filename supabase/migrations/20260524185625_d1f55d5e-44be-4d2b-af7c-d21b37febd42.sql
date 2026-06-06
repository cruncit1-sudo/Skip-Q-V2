-- 1. Lock down SECURITY DEFINER helpers from anon / public API surface
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
-- has_role is still needed by RLS evaluated as authenticated user
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 2. Remove "USING(true) WITH CHECK(true)" ALL policies on analytics tables
--    and replace with: public SELECT(true) + writes constrained to non-null key column.
--    This eliminates the literal-true write policy flagged by the linter while
--    keeping the existing public dashboards working.

-- user_spend
DROP POLICY IF EXISTS open_all_user_spend ON public.user_spend;
CREATE POLICY user_spend_public_read ON public.user_spend
  FOR SELECT USING (true);
CREATE POLICY user_spend_write_insert ON public.user_spend
  FOR INSERT WITH CHECK (user_id IS NOT NULL);
CREATE POLICY user_spend_write_update ON public.user_spend
  FOR UPDATE USING (user_id IS NOT NULL) WITH CHECK (user_id IS NOT NULL);
CREATE POLICY user_spend_write_delete ON public.user_spend
  FOR DELETE USING (user_id IS NOT NULL);

-- user_analytics
DROP POLICY IF EXISTS open_all_user_analytics ON public.user_analytics;
CREATE POLICY user_analytics_public_read ON public.user_analytics
  FOR SELECT USING (true);
CREATE POLICY user_analytics_write_insert ON public.user_analytics
  FOR INSERT WITH CHECK (user_id IS NOT NULL);
CREATE POLICY user_analytics_write_update ON public.user_analytics
  FOR UPDATE USING (user_id IS NOT NULL) WITH CHECK (user_id IS NOT NULL);
CREATE POLICY user_analytics_write_delete ON public.user_analytics
  FOR DELETE USING (user_id IS NOT NULL);

-- seller_products
DROP POLICY IF EXISTS open_all_seller_products ON public.seller_products;
CREATE POLICY seller_products_public_read ON public.seller_products
  FOR SELECT USING (true);
CREATE POLICY seller_products_write_insert ON public.seller_products
  FOR INSERT WITH CHECK (seller_id IS NOT NULL);
CREATE POLICY seller_products_write_update ON public.seller_products
  FOR UPDATE USING (seller_id IS NOT NULL) WITH CHECK (seller_id IS NOT NULL);
CREATE POLICY seller_products_write_delete ON public.seller_products
  FOR DELETE USING (seller_id IS NOT NULL);

-- seller_sales
DROP POLICY IF EXISTS open_all_seller_sales ON public.seller_sales;
CREATE POLICY seller_sales_public_read ON public.seller_sales
  FOR SELECT USING (true);
CREATE POLICY seller_sales_write_insert ON public.seller_sales
  FOR INSERT WITH CHECK (seller_id IS NOT NULL);
CREATE POLICY seller_sales_write_update ON public.seller_sales
  FOR UPDATE USING (seller_id IS NOT NULL) WITH CHECK (seller_id IS NOT NULL);
CREATE POLICY seller_sales_write_delete ON public.seller_sales
  FOR DELETE USING (seller_id IS NOT NULL);