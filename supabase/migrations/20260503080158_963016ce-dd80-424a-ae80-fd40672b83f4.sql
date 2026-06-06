
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. master_admin (no RLS, no policies — direct SQL only)
CREATE TABLE public.master_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.master_admin ENABLE ROW LEVEL SECURITY;
-- intentionally no policies => locked from anon/authenticated

-- 2. sellers
CREATE TABLE public.sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text NOT NULL,
  canteen_name text NOT NULL,
  canteen_location text NOT NULL,
  canteen_type text,
  username text UNIQUE,
  upi_id text,
  bank_account_number text,
  bank_ifsc text,
  bank_name text,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_suspended boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all_sellers" ON public.sellers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. seller_sales
CREATE TABLE public.seller_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_orders int NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, date)
);
ALTER TABLE public.seller_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all_seller_sales" ON public.seller_sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. seller_products
CREATE TABLE public.seller_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  emoji text,
  price numeric NOT NULL,
  category text,
  total_sold int NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  last_sold_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.seller_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all_seller_products" ON public.seller_products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. user_analytics
CREATE TABLE public.user_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text,
  screen_name text NOT NULL,
  event_type text NOT NULL,
  dwell_seconds int NOT NULL DEFAULT 0,
  scroll_depth_pct int NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all_user_analytics" ON public.user_analytics FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. user_spend
CREATE TABLE public.user_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id text,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  payment_method text,
  product_names text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all_user_spend" ON public.user_spend FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 7. seller_sessions
CREATE TABLE public.seller_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE,
  logged_in_at timestamptz NOT NULL DEFAULT now(),
  logged_out_at timestamptz,
  ip_address text
);
ALTER TABLE public.seller_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all_seller_sessions" ON public.seller_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 8. admin_audit_log
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  target text,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all_admin_audit_log" ON public.admin_audit_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- RPC: verify master admin login (compares plaintext to bcrypt hash server-side)
CREATE OR REPLACE FUNCTION public.verify_master_admin(p_username text, p_password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.master_admin
    WHERE username = p_username
      AND password_hash = crypt(p_password, password_hash)
  );
$$;
GRANT EXECUTE ON FUNCTION public.verify_master_admin(text, text) TO anon, authenticated;

-- RPC: verify seller login (used by Change Password flow)
CREATE OR REPLACE FUNCTION public.verify_seller_password(p_seller_id uuid, p_password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sellers
    WHERE id = p_seller_id
      AND password_hash = crypt(p_password, password_hash)
  );
$$;
GRANT EXECUTE ON FUNCTION public.verify_seller_password(uuid, text) TO anon, authenticated;

-- RPC: hash a password (bcrypt) for inserts/updates from the dashboard
CREATE OR REPLACE FUNCTION public.hash_password(p_password text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT crypt(p_password, gen_salt('bf'));
$$;
GRANT EXECUTE ON FUNCTION public.hash_password(text) TO anon, authenticated;
