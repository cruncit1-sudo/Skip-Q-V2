
-- user_analytics: contains sensitive metadata. Lock down entirely.
DROP POLICY IF EXISTS "user_analytics_public_read" ON public.user_analytics;
DROP POLICY IF EXISTS "user_analytics_write_insert" ON public.user_analytics;
DROP POLICY IF EXISTS "user_analytics_write_update" ON public.user_analytics;
DROP POLICY IF EXISTS "user_analytics_write_delete" ON public.user_analytics;

REVOKE ALL ON public.user_analytics FROM anon, authenticated;
GRANT ALL ON public.user_analytics TO service_role;

CREATE POLICY "Admins view user_analytics"
ON public.user_analytics FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own analytics"
ON public.user_analytics FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.user_analytics TO authenticated;

-- seller_products: keep public read (aggregated product stats), restrict writes
DROP POLICY IF EXISTS "seller_products_write_insert" ON public.seller_products;
DROP POLICY IF EXISTS "seller_products_write_update" ON public.seller_products;
DROP POLICY IF EXISTS "seller_products_write_delete" ON public.seller_products;

REVOKE INSERT, UPDATE, DELETE ON public.seller_products FROM anon, authenticated;
GRANT ALL ON public.seller_products TO service_role;

CREATE POLICY "Admins manage seller_products"
ON public.seller_products FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- seller_sales: keep public read of aggregated sales, restrict writes
DROP POLICY IF EXISTS "seller_sales_write_insert" ON public.seller_sales;
DROP POLICY IF EXISTS "seller_sales_write_update" ON public.seller_sales;
DROP POLICY IF EXISTS "seller_sales_write_delete" ON public.seller_sales;

REVOKE INSERT, UPDATE, DELETE ON public.seller_sales FROM anon, authenticated;
GRANT ALL ON public.seller_sales TO service_role;

CREATE POLICY "Admins manage seller_sales"
ON public.seller_sales FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- user_spend: restrict reads to own rows + admins; writes via service role only
DROP POLICY IF EXISTS "user_spend_public_read" ON public.user_spend;
DROP POLICY IF EXISTS "user_spend_write_insert" ON public.user_spend;
DROP POLICY IF EXISTS "user_spend_write_update" ON public.user_spend;
DROP POLICY IF EXISTS "user_spend_write_delete" ON public.user_spend;

REVOKE ALL ON public.user_spend FROM anon, authenticated;
GRANT ALL ON public.user_spend TO service_role;
GRANT SELECT ON public.user_spend TO authenticated;

CREATE POLICY "Users view own spend"
ON public.user_spend FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all spend"
ON public.user_spend FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- payments: add restrictive policy so only admins (or service role) can INSERT
CREATE POLICY "Deny non-admin payment inserts"
ON public.payments AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
