DROP POLICY IF EXISTS "Anyone can create seller offers" ON public.seller_offers;
DROP POLICY IF EXISTS "Anyone can update seller offers" ON public.seller_offers;
DROP POLICY IF EXISTS "Anyone can delete seller offers" ON public.seller_offers;

CREATE POLICY "Active sellers can create offers"
ON public.seller_offers
FOR INSERT
TO anon, authenticated
WITH CHECK (
  seller_id IS NOT NULL
  AND kind IN ('general', 'inventory')
  AND discount_pct > 0
  AND discount_pct <= 100
  AND EXISTS (
    SELECT 1 FROM public.sellers s
    WHERE s.id = seller_offers.seller_id
      AND s.is_active = true
      AND s.is_suspended = false
  )
);

CREATE POLICY "Active sellers can update offers"
ON public.seller_offers
FOR UPDATE
TO anon, authenticated
USING (
  seller_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.sellers s
    WHERE s.id = seller_offers.seller_id
      AND s.is_active = true
      AND s.is_suspended = false
  )
)
WITH CHECK (
  seller_id IS NOT NULL
  AND kind IN ('general', 'inventory')
  AND discount_pct > 0
  AND discount_pct <= 100
  AND EXISTS (
    SELECT 1 FROM public.sellers s
    WHERE s.id = seller_offers.seller_id
      AND s.is_active = true
      AND s.is_suspended = false
  )
);

CREATE POLICY "Active sellers can delete offers"
ON public.seller_offers
FOR DELETE
TO anon, authenticated
USING (
  seller_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.sellers s
    WHERE s.id = seller_offers.seller_id
      AND s.is_active = true
      AND s.is_suspended = false
  )
);