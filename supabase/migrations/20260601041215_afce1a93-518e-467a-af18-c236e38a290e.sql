-- App settings table for admin-tunable values like COD hours.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read app_settings"
ON public.app_settings
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins manage app_settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.app_settings (key, value) VALUES
  ('cod_start_hour', '8'),
  ('cod_end_hour', '20'),
  ('cod_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- Server-time COD availability check (IST window).
CREATE OR REPLACE FUNCTION public.is_cod_allowed()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_ist_hour INTEGER;
  start_hour INTEGER;
  end_hour INTEGER;
  cod_enabled BOOLEAN;
BEGIN
  SELECT value::INTEGER INTO start_hour FROM public.app_settings WHERE key = 'cod_start_hour';
  SELECT value::INTEGER INTO end_hour   FROM public.app_settings WHERE key = 'cod_end_hour';
  SELECT value::BOOLEAN INTO cod_enabled FROM public.app_settings WHERE key = 'cod_enabled';

  IF start_hour IS NULL THEN start_hour := 8; END IF;
  IF end_hour   IS NULL THEN end_hour := 20; END IF;
  IF cod_enabled IS NULL THEN cod_enabled := true; END IF;

  IF NOT cod_enabled THEN RETURN FALSE; END IF;

  current_ist_hour := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'));
  RETURN current_ist_hour >= start_hour AND current_ist_hour < end_hour;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_cod_allowed() TO anon, authenticated, service_role;