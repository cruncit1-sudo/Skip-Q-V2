
CREATE POLICY "seller_offers_public_write" ON public.seller_offers FOR INSERT WITH CHECK (true);
CREATE POLICY "seller_offers_public_update" ON public.seller_offers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "seller_offers_public_delete" ON public.seller_offers FOR DELETE USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_offers TO anon, authenticated;
