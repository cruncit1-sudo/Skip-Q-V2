ALTER TABLE public.seller_products
  ADD COLUMN IF NOT EXISTS stock_limit integer,
  ADD COLUMN IF NOT EXISTS available_until timestamptz;