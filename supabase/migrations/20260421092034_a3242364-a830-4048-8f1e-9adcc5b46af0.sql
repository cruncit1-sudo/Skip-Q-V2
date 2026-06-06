
-- =========================================================
-- 1. ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'seller', 'customer');
CREATE TYPE public.seller_status AS ENUM ('pending', 'approved', 'suspended', 'rejected');
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded');

-- =========================================================
-- 2. SHARED updated_at TRIGGER
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- 3. PROFILES (1:1 with auth.users)
-- =========================================================
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 4. USER ROLES (separate table — prevents privilege escalation)
-- =========================================================
CREATE TABLE public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- =========================================================
-- 5. AUTO-CREATE PROFILE + DEFAULT ROLE ON SIGNUP
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.phone
  )
  ON CONFLICT (id) DO NOTHING;

  -- Default every new signup to 'customer'. Admin/Seller granted explicitly.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- 6. SELLER PROFILES (extra info for sellers)
-- =========================================================
CREATE TABLE public.seller_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name   TEXT NOT NULL,
  description     TEXT,
  logo_url        TEXT,
  cover_url       TEXT,
  address_line    TEXT,
  city            TEXT,
  state           TEXT,
  pincode         TEXT,
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  status          public.seller_status NOT NULL DEFAULT 'pending',
  invited_by      UUID REFERENCES auth.users(id),
  approved_by     UUID REFERENCES auth.users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_sellers_updated BEFORE UPDATE ON public.seller_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_seller_profiles_status ON public.seller_profiles(status);

-- =========================================================
-- 7. ADDRESSES (delivery)
-- =========================================================
CREATE TABLE public.addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        TEXT,            -- Home / Work / Other
  recipient    TEXT NOT NULL,
  phone        TEXT NOT NULL,
  line1        TEXT NOT NULL,
  line2        TEXT,
  city         TEXT NOT NULL,
  state        TEXT NOT NULL,
  pincode      TEXT NOT NULL,
  latitude     NUMERIC(10,7),
  longitude    NUMERIC(10,7),
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_addresses_updated BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_addresses_user ON public.addresses(user_id);

-- =========================================================
-- 8. CATEGORIES
-- =========================================================
CREATE TABLE public.categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  image_url   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 9. MENU ITEMS
-- =========================================================
CREATE TABLE public.menu_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    UUID NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image_url    TEXT,
  is_veg       BOOLEAN NOT NULL DEFAULT true,
  is_available BOOLEAN NOT NULL DEFAULT true,
  prep_minutes INT DEFAULT 20,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_menu_items_seller ON public.menu_items(seller_id);
CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);

-- =========================================================
-- 10. ORDERS
-- =========================================================
CREATE TABLE public.orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      TEXT NOT NULL UNIQUE DEFAULT ('ORD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  customer_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_id         UUID NOT NULL REFERENCES public.seller_profiles(id) ON DELETE RESTRICT,
  delivery_address  JSONB NOT NULL,
  subtotal          NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
  delivery_fee      NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax               NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  total             NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  status            public.order_status NOT NULL DEFAULT 'pending',
  notes             TEXT,
  placed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_orders_seller ON public.orders(seller_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_placed_at ON public.orders(placed_at DESC);

-- =========================================================
-- 11. ORDER ITEMS (snapshot of menu at time of order)
-- =========================================================
CREATE TABLE public.order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id  UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  unit_price    NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  quantity      INT NOT NULL CHECK (quantity > 0),
  line_total    NUMERIC(10,2) NOT NULL CHECK (line_total >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_order_items_order ON public.order_items(order_id);

-- =========================================================
-- 12. ORDER STATUS HISTORY
-- =========================================================
CREATE TABLE public.order_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status      public.order_status NOT NULL,
  changed_by  UUID REFERENCES auth.users(id),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_order_status_history_order ON public.order_status_history(order_id);

-- =========================================================
-- 13. PAYMENTS (Razorpay)
-- =========================================================
CREATE TABLE public.payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  razorpay_order_id   TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature  TEXT,
  amount              NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              public.payment_status NOT NULL DEFAULT 'created',
  method              TEXT,
  error_code          TEXT,
  error_description   TEXT,
  raw_response        JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_payments_order ON public.payments(order_id);
CREATE INDEX idx_payments_customer ON public.payments(customer_id);

-- =========================================================
-- 14. AUDIT LOGS (admin actions)
-- =========================================================
CREATE TABLE public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- =========================================================
-- 15. OTP ATTEMPTS (rate-limit tracking)
-- =========================================================
CREATE TABLE public.otp_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  TEXT NOT NULL,    -- phone or email
  ip_address  TEXT,
  success     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.otp_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_otp_attempts_identifier_time ON public.otp_attempts(identifier, created_at DESC);

-- =========================================================
-- 16. ROW LEVEL SECURITY POLICIES
-- =========================================================

-- ---------- profiles ----------
CREATE POLICY "Users view own profile"   ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------- user_roles ----------
CREATE POLICY "Users view own roles"   ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles"  ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles"    ON public.user_roles FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- seller_profiles ----------
CREATE POLICY "Public view approved sellers" ON public.seller_profiles FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY "Sellers view own profile"     ON public.seller_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Sellers update own profile"   ON public.seller_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND status = (SELECT status FROM public.seller_profiles WHERE id = seller_profiles.id));
CREATE POLICY "Admins full access sellers"   ON public.seller_profiles FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- addresses ----------
CREATE POLICY "Users manage own addresses" ON public.addresses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all addresses"  ON public.addresses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------- categories ----------
CREATE POLICY "Public view active categories" ON public.categories FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Admins manage categories"      ON public.categories FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- menu_items ----------
CREATE POLICY "Public view available items"
  ON public.menu_items FOR SELECT TO anon, authenticated
  USING (
    is_available = true
    AND EXISTS (SELECT 1 FROM public.seller_profiles s WHERE s.id = menu_items.seller_id AND s.status = 'approved')
  );
CREATE POLICY "Sellers manage own menu"
  ON public.menu_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seller_profiles s WHERE s.id = menu_items.seller_id AND s.user_id = auth.uid() AND s.status = 'approved'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.seller_profiles s WHERE s.id = menu_items.seller_id AND s.user_id = auth.uid() AND s.status = 'approved'));
CREATE POLICY "Admins full access menu" ON public.menu_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- orders ----------
CREATE POLICY "Customers view own orders"   ON public.orders FOR SELECT TO authenticated USING (auth.uid() = customer_id);
CREATE POLICY "Customers create own orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Sellers view own orders"     ON public.orders FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.seller_profiles s WHERE s.id = orders.seller_id AND s.user_id = auth.uid()));
CREATE POLICY "Sellers update own orders"   ON public.orders FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.seller_profiles s WHERE s.id = orders.seller_id AND s.user_id = auth.uid()));
CREATE POLICY "Admins full access orders"   ON public.orders FOR ALL    TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- order_items ----------
CREATE POLICY "View order items via parent order"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          o.customer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.seller_profiles s WHERE s.id = o.seller_id AND s.user_id = auth.uid())
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );
CREATE POLICY "Customers insert items into own orders"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.customer_id = auth.uid()));

-- ---------- order_status_history ----------
CREATE POLICY "View status history via parent order"
  ON public.order_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND (
          o.customer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.seller_profiles s WHERE s.id = o.seller_id AND s.user_id = auth.uid())
          OR public.has_role(auth.uid(), 'admin')
        )
    )
  );
CREATE POLICY "Sellers/Admins insert status history"
  ON public.order_status_history FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.seller_profiles s ON s.id = o.seller_id
      WHERE o.id = order_status_history.order_id AND s.user_id = auth.uid()
    )
  );

-- ---------- payments ----------
CREATE POLICY "Customers view own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = customer_id);
CREATE POLICY "Sellers view payments for their orders"
  ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o JOIN public.seller_profiles s ON s.id = o.seller_id WHERE o.id = payments.order_id AND s.user_id = auth.uid()));
CREATE POLICY "Admins full access payments" ON public.payments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
-- Note: payment writes (create/update) happen exclusively from edge functions using service role.

-- ---------- audit_logs ----------
CREATE POLICY "Admins view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- Inserts come from edge functions (service role) only.

-- ---------- otp_attempts ----------
CREATE POLICY "Admins view otp attempts" ON public.otp_attempts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- Inserts come from edge functions (service role) only.
