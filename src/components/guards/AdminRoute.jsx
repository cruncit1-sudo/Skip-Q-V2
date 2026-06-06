import { Navigate } from 'react-router-dom';
import { getAdminSession } from '../../utils/sessionManager';

export default function AdminRoute({ children }) {
  const session = getAdminSession();
  if (!session) return <Navigate to="/master-admin/login" replace />;
  return children;
}
