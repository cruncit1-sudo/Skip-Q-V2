-- New custom users table for User ID + PIN auth
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  user_id text UNIQUE NOT NULL,
  college_name text NOT NULL,
  phone text NOT NULL,
  pin_hash text NOT NULL,
  razorpay_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (edge functions) can access.

CREATE INDEX IF NOT EXISTS users_user_id_idx ON public.users (user_id);

-- Drop old PIN/college/Razorpay columns from profiles (Supabase Auth flow scrapped)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin_hash;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS college_name;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS razorpay_customer_id;