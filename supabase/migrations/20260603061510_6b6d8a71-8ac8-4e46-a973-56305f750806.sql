
-- 1. New inventory columns (additive, keeps legacy stock_limit/available_until intact)
ALTER TABLE public.seller_products
  ADD COLUMN IF NOT EXISTS inventory_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stock_quantity integer,
  ADD COLUMN IF NOT EXISTS available_from time,
  ADD COLUMN IF NOT EXISTS available_to time,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seller_products_inventory_type_check'
  ) THEN
    ALTER TABLE public.seller_products
      ADD CONSTRAINT seller_products_inventory_type_check
      CHECK (inventory_type IN ('none','quantity','time'));
  END IF;
END $$;

-- 2. Availability RPC (server source of truth)
CREATE OR REPLACE FUNCTION public.is_item_available(product_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.seller_products%ROWTYPE;
  ist_t time;
BEGIN
  SELECT * INTO p FROM public.seller_products WHERE id = product_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF p.is_active IS DISTINCT FROM TRUE THEN RETURN FALSE; END IF;

  IF p.inventory_type = 'quantity' THEN
    IF p.stock_quantity IS NULL OR p.stock_quantity <= 0 THEN
      RETURN FALSE;
    END IF;
  ELSIF p.inventory_type = 'time' THEN
    IF p.available_from IS NULL OR p.available_to IS NULL THEN
      RETURN FALSE;
    END IF;
    ist_t := (NOW() AT TIME ZONE 'Asia/Kolkata')::time;
    IF p.available_from <= p.available_to THEN
      IF ist_t < p.available_from OR ist_t > p.available_to THEN
        RETURN FALSE;
      END IF;
    ELSE
      -- overnight window
      IF ist_t < p.available_from AND ist_t > p.available_to THEN
        RETURN FALSE;
      END IF;
    END IF;
  END IF;

  -- Legacy fields
  IF p.stock_limit IS NOT NULL AND p.stock_limit <= 0 THEN RETURN FALSE; END IF;
  IF p.available_until IS NOT NULL AND p.available_until <= now() THEN RETURN FALSE; END IF;

  RETURN TRUE;
END;
$$;

-- 3. Stock decrement helper (called from edge fn on order create)
CREATE OR REPLACE FUNCTION public.reduce_seller_stock(p_product_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.seller_products
    SET stock_quantity = GREATEST(0, COALESCE(stock_quantity,0) - p_qty),
        is_active = CASE
          WHEN inventory_type = 'quantity'
            AND COALESCE(stock_quantity,0) - p_qty <= 0
          THEN FALSE ELSE is_active END,
        updated_at = now()
    WHERE id = p_product_id AND inventory_type = 'quantity';

  -- Legacy stock_limit support
  UPDATE public.seller_products
    SET stock_limit = GREATEST(0, stock_limit - p_qty),
        is_active = CASE WHEN stock_limit - p_qty <= 0 THEN FALSE ELSE is_active END,
        updated_at = now()
    WHERE id = p_product_id AND stock_limit IS NOT NULL;
END;
$$;

-- 4. Time-window flipper (called from cron)
CREATE OR REPLACE FUNCTION public.update_time_based_availability()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ist_t time := (NOW() AT TIME ZONE 'Asia/Kolkata')::time;
BEGIN
  -- Open the window
  UPDATE public.seller_products
    SET is_active = TRUE, updated_at = now()
    WHERE inventory_type = 'time'
      AND available_from IS NOT NULL AND available_to IS NOT NULL
      AND is_active = FALSE
      AND (
        (available_from <= available_to
          AND ist_t >= available_from AND ist_t <= available_to)
        OR
        (available_from > available_to
          AND (ist_t >= available_from OR ist_t <= available_to))
      );

  -- Close the window
  UPDATE public.seller_products
    SET is_active = FALSE, updated_at = now()
    WHERE inventory_type = 'time'
      AND available_from IS NOT NULL AND available_to IS NOT NULL
      AND is_active = TRUE
      AND (
        (available_from <= available_to
          AND (ist_t < available_from OR ist_t > available_to))
        OR
        (available_from > available_to
          AND ist_t < available_from AND ist_t > available_to)
      );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_item_available(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reduce_seller_stock(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_time_based_availability() TO service_role;

ALTER TABLE public.seller_products REPLICA IDENTITY FULL;
