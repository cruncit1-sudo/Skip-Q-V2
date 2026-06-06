import { Navigate } from 'react-router-dom';
import { getUserSession } from '../../utils/sessionManager';

export default function UserRoute({ children }) {
  const session = getUserSession();
  if (!session) return <Navigate to="/app/login" replace />;
  return children;
}
