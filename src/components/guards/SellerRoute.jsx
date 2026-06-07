import { Navigate } from 'react-router-dom';
import { getSellerSession } from '../../utils/sessionManager';

export default function SellerRoute({ children }) {
  const session = getSellerSession();

  if (!session) {
    return <Navigate to="/seller/login" replace />;
  }

  return children;
}