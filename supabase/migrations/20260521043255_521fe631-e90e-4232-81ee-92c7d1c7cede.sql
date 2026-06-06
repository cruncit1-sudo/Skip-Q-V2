CREATE TABLE IF NOT EXISTS public.seller_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid,
  kind text NOT NULL DEFAULT 'general',
  name text NOT NULL,
  discount_pct numeric NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  condition text NOT NULL DEFAULT '',
  item_ids text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public view seller offers" ON public.seller_offers;
DROP POLICY IF EXISTS "Anyone can create seller offers" ON public.seller_offers;
DROP POLICY IF EXISTS "Anyone can update seller offers" ON public.seller_offers;
DROP POLICY IF EXISTS "Anyone can delete seller offers" ON public.seller_offers;

CREATE POLICY "Public view seller offers"
ON public.seller_offers
FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Anyone can create seller offers"
ON public.seller_offers
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Anyone can update seller offers"
ON public.seller_offers
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Anyone can delete seller offers"
ON public.seller_offers
FOR DELETE
TO anon, authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_seller_offers_seller_id ON public.seller_offers (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_offers_active_dates ON public.seller_offers (is_active, start_date, end_date);

DROP TRIGGER IF EXISTS set_seller_offers_updated_at ON public.seller_offers;
CREATE TRIGGER set_seller_offers_updated_at
BEFORE UPDATE ON public.seller_offers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();