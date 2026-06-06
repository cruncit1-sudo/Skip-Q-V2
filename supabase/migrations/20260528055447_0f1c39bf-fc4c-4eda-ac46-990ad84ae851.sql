
-- Restore permissive policies for tables accessed by the custom-auth client (anon key, no auth.uid()).
-- Sensitive operations (admin/seller account writes, payments) still go through edge functions with service_role.

-- sellers: master admin panel and seller route read this directly with anon key.
GRANT SELECT ON public.sellers TO anon, authenticated;
DROP POLICY IF EXISTS "Public read sellers basic" ON public.sellers;
CREATE POLICY "Public read sellers basic" ON public.sellers
  FOR SELECT TO anon, authenticated
  USING (true);

-- seller_products: sellers manage their own inventory from the client.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_products TO anon, authenticated;
DROP POLICY IF EXISTS "seller_products_public_read" ON public.seller_products;
DROP POLICY IF EXISTS "seller_products_public_write" ON public.seller_products;
DROP POLICY IF EXISTS "seller_products_public_update" ON public.seller_products;
DROP POLICY IF EXISTS "seller_products_public_delete" ON public.seller_products;
CREATE POLICY "seller_products_public_read" ON public.seller_products
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "seller_products_public_write" ON public.seller_products
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "seller_products_public_update" ON public.seller_products
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "seller_products_public_delete" ON public.seller_products
  FOR DELETE TO anon, authenticated USING (true);

-- seller_sales: read for admin overview; aggregated upserts done by triggers/edge funcs.
GRANT SELECT, INSERT, UPDATE ON public.seller_sales TO anon, authenticated;
DROP POLICY IF EXISTS "seller_sales_public_read" ON public.seller_sales;
DROP POLICY IF EXISTS "seller_sales_public_write" ON public.seller_sales;
DROP POLICY IF EXISTS "seller_sales_public_update" ON public.seller_sales;
CREATE POLICY "seller_sales_public_read" ON public.seller_sales
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "seller_sales_public_write" ON public.seller_sales
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "seller_sales_public_update" ON public.seller_sales
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- user_analytics: client writes events directly; admin reads from panel.
GRANT SELECT, INSERT ON public.user_analytics TO anon, authenticated;
DROP POLICY IF EXISTS "Users insert own analytics" ON public.user_analytics;
DROP POLICY IF EXISTS "Admins view user_analytics" ON public.user_analytics;
DROP POLICY IF EXISTS "user_analytics_public_read" ON public.user_analytics;
DROP POLICY IF EXISTS "user_analytics_public_write" ON public.user_analytics;
CREATE POLICY "user_analytics_public_read" ON public.user_analytics
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "user_analytics_public_write" ON public.user_analytics
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- user_spend: read for admin user-detail page; written by edge funcs.
GRANT SELECT, INSERT ON public.user_spend TO anon, authenticated;
DROP POLICY IF EXISTS "Users view own spend" ON public.user_spend;
DROP POLICY IF EXISTS "Admins view all spend" ON public.user_spend;
DROP POLICY IF EXISTS "user_spend_public_read" ON public.user_spend;
DROP POLICY IF EXISTS "user_spend_public_write" ON public.user_spend;
CREATE POLICY "user_spend_public_read" ON public.user_spend
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "user_spend_public_write" ON public.user_spend
  FOR INSERT TO anon, authenticated WITH CHECK (true);
