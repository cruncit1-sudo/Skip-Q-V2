import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getSellerSession } from '../../utils/sessionManager';
import { queryWithTimeout } from '../../utils/networkStatus';
import { clearSellerScopedCaches } from '../../lib/sellerCaches';

export default function SellerRoute({ children }) {
  const session = getSellerSession();
  const [valid, setValid] = useState(() => Boolean(session?.id));

  useEffect(() => {
    let alive = true;
    async function verify() {
      if (!session?.id) {
        if (alive) setValid(false);
        return;
      }
      if (!session?.id || !String(session.id).includes('-')) {
        localStorage.removeItem('bitez_seller_session');
        localStorage.removeItem('bitez.seller.session.v1');
        clearSellerScopedCaches();
        if (alive) setValid(false);
        return;
      }
      if (alive) setValid(true);
      const { data, error } = await queryWithTimeout(supabase
        .from('sellers')
        .select('id, is_active, is_suspended')
        .eq('id', session.id)
        .maybeSingle(), 4000);
      if (error) return;
      const ok = Boolean(data?.id && data.is_active !== false && !data.is_suspended);
      if (!ok) {
        localStorage.removeItem('bitez_seller_session');
        localStorage.removeItem('bitez.seller.session.v1');
        clearSellerScopedCaches();
      }
      if (alive) setValid(ok);
    }
    verify();
    return () => { alive = false; };
  }, [session?.id]);

  if (!session || !valid) return <Navigate to="/seller/login" replace />;
  return children;
}