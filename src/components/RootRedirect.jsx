import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getActiveSession } from '../utils/sessionManager';
import { getAdminStandaloneRedirect } from '../lib/pwaLaunch';

export default function RootRedirect() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener('pushstate', sync);
    window.addEventListener('replacestate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('pushstate', sync);
      window.removeEventListener('replacestate', sync);
    };
  }, []);

  const s = getActiveSession();
  const adminPwaRedirect = getAdminStandaloneRedirect(path);
  if (adminPwaRedirect) return <Navigate to={adminPwaRedirect} replace />;

  if (path.startsWith('/master-admin')) {
    return <Navigate to={s?.role === 'master_admin' ? '/master-admin/overview' : '/master-admin/login'} replace />;
  }
  if (path.startsWith('/seller')) {
    return <Navigate to={s?.role === 'seller' ? '/seller/dashboard' : '/seller/login'} replace />;
  }
  if (path.startsWith('/app')) {
    return <Navigate to={s?.role === 'user' ? '/app/home' : '/app/login'} replace />;
  }
  if (!s) return <Navigate to="/app/login" replace />;
  if (s.role === 'master_admin') return <Navigate to="/master-admin/overview" replace />;
  if (s.role === 'seller') return <Navigate to="/seller/dashboard" replace />;
  return <Navigate to="/app/home" replace />;
}