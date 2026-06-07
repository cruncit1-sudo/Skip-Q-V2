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

  if (path.startsWith('/app')) {
    return <Navigate to={s?.role === 'user' ? '/app/home' : '/app/login'} replace />;
  }
  
  if (!s || s.role !== 'user') return <Navigate to="/app/login" replace />;
  return <Navigate to="/app/home" replace />;
}