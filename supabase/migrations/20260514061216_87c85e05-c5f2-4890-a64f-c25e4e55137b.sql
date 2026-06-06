CREATE INDEX IF NOT EXISTS idx_user_analytics_orders_created_at
ON public.user_analytics (created_at DESC)
WHERE event_type = 'order' AND screen_name = 'order';

CREATE INDEX IF NOT EXISTS idx_user_analytics_orders_user_id_created_at
ON public.user_analytics (user_id, created_at DESC)
WHERE event_type = 'order' AND screen_name = 'order';

CREATE INDEX IF NOT EXISTS idx_user_analytics_orders_app_user_id_created_at
ON public.user_analytics ((metadata->>'appUserId'), created_at DESC)
WHERE event_type = 'order' AND screen_name = 'order';

CREATE INDEX IF NOT EXISTS idx_user_analytics_orders_seller_id_created_at
ON public.user_analytics ((metadata->>'sellerId'), created_at DESC)
WHERE event_type = 'order' AND screen_name = 'order';

CREATE INDEX IF NOT EXISTS idx_sellers_active_created_at
ON public.sellers (is_active, is_suspended, created_at DESC);