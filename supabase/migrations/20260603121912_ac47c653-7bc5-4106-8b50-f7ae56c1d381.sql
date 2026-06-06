-- =========================================================
-- 1. sellers: drop broad SELECT policy, use column-level grants
-- =========================================================
DROP POLICY IF EXISTS "Public read sellers basic" ON public.sellers;

CREATE POLICY "Public read sellers safe columns"
  ON public.sellers
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE SELECT ON public.sellers FROM anon, authenticated;
GRANT SELECT
  (id, name, canteen_name, canteen_type, canteen_location, username,
   is_active, is_suspended, created_by, created_at)
  ON public.sellers TO anon, authenticated;
GRANT ALL ON public.sellers TO service_role;

-- =========================================================
-- 2. user_spend: owner / admin only
-- =========================================================
DROP POLICY IF EXISTS "user_spend_public_read" ON public.user_spend;

CREATE POLICY "Users view own spend"
  ON public.user_spend
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all spend"
  ON public.user_spend
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.user_spend TO authenticated;
REVOKE SELECT ON public.user_spend FROM anon;
GRANT ALL ON public.user_spend TO service_role;

-- =========================================================
-- 3. user_analytics: owner / admin only
-- =========================================================
DROP POLICY IF EXISTS "user_analytics_public_read" ON public.user_analytics;

CREATE POLICY "Users view own analytics"
  ON public.user_analytics
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all analytics"
  ON public.user_analytics
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.user_analytics TO authenticated;
REVOKE SELECT ON public.user_analytics FROM anon;
GRANT ALL ON public.user_analytics TO service_role;

-- =========================================================
-- 4. seller_offers: seller-scoped writes
-- =========================================================
DROP POLICY IF EXISTS "seller_offers_public_write"  ON public.seller_offers;
DROP POLICY IF EXISTS "seller_offers_public_update" ON public.seller_offers;
DROP POLICY IF EXISTS "seller_offers_public_delete" ON public.seller_offers;

CREATE POLICY "Sellers insert own offers"
  ON public.seller_offers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.seller_profiles s
      WHERE s.id = seller_offers.seller_id
        AND s.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Sellers update own offers"
  ON public.seller_offers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.seller_profiles s
      WHERE s.id = seller_offers.seller_id
        AND s.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Sellers delete own offers"
  ON public.seller_offers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.seller_profiles s
      WHERE s.id = seller_offers.seller_id
        AND s.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

GRANT ALL ON public.seller_offers TO service_role;

-- =========================================================
-- 5. seller_sales: admin/service_role only writes
-- =========================================================
DROP POLICY IF EXISTS "seller_sales_public_write"  ON public.seller_sales;
DROP POLICY IF EXISTS "seller_sales_public_update" ON public.seller_sales;

REVOKE INSERT, UPDATE, DELETE ON public.seller_sales FROM anon, authenticated;
GRANT ALL ON public.seller_sales TO service_role;

-- =========================================================
-- 6. Revoke EXECUTE on sensitive SECURITY DEFINER functions
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.verify_master_admin(text, text)   FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_seller_password(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hash_password(text)               FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_time_based_availability()  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reduce_seller_stock(uuid, integer) FROM anon, authenticated, PUBLIC;
-- has_role, is_cod_allowed, is_item_available are used by RLS / read paths and remain callable.