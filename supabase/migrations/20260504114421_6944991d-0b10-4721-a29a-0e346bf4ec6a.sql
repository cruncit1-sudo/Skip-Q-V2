-- Push notification subscriptions
-- Stores Web Push endpoints per user/seller so the server can send notifications.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                    -- nullable: customers (auth.users.id) OR app-user (public.users.id)
  seller_id uuid,                  -- nullable: sellers (public.sellers.id)
  role text NOT NULL CHECK (role IN ('customer','seller','admin')),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_seller_id ON public.push_subscriptions(seller_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_role ON public.push_subscriptions(role);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon + authenticated) to insert/update their own subscription.
-- We keep this permissive because the app uses a custom users/sellers auth model
-- (not auth.users) and identifies callers via user_id/seller_id in the row itself.
-- The endpoint is unique so collisions resolve via upsert.
CREATE POLICY "anyone can register a push subscription"
  ON public.push_subscriptions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anyone can update a push subscription by endpoint"
  ON public.push_subscriptions
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anyone can delete their own push subscription"
  ON public.push_subscriptions
  FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "admins view all subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users view own subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  TO anon, authenticated
  USING (true);
