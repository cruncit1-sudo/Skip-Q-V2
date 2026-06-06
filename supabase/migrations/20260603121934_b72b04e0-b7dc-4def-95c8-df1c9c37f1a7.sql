REVOKE EXECUTE ON FUNCTION public.is_cod_allowed()        FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_item_available(uuid) FROM anon, authenticated, PUBLIC;