-- Lock down sellers table: column-level grants for safe columns, no writes from anon/auth
DROP POLICY IF EXISTS "open_all_sellers" ON public.sellers;

-- Row-level: allow SELECT on all rows. Column-level GRANTs below restrict which columns.
CREATE POLICY "Public read sellers (non-sensitive columns only)"
ON public.sellers
FOR SELECT
TO anon, authenticated
USING (true);

-- No INSERT/UPDATE/DELETE policies => only service_role can write.

-- Column-level access control. Revoke broad table privileges first, then re-grant only safe columns for SELECT.
REVOKE ALL ON public.sellers FROM anon, authenticated;
GRANT SELECT (
  id,
  username,
  name,
  canteen_name,
  canteen_location,
  canteen_type,
  is_active,
  is_suspended,
  created_at,
  created_by
) ON public.sellers TO anon, authenticated;
