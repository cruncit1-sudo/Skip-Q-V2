CREATE INDEX IF NOT EXISTS idx_user_analytics_order_seller_created
  ON public.user_analytics ((metadata->>'sellerId'), created_at DESC)
  WHERE event_type = 'order';

CREATE INDEX IF NOT EXISTS idx_user_analytics_order_appuser_created
  ON public.user_analytics ((metadata->>'appUserId'), created_at DESC)
  WHERE event_type = 'order';

CREATE INDEX IF NOT EXISTS idx_user_analytics_order_user_created
  ON public.user_analytics (user_id, created_at DESC)
  WHERE event_type = 'order';