import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@busbuddy/shared';
import { LoadingBlock } from '@/components/ui/feedback';
import { homePathFor, useAuth } from './auth-context';

export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { status, me } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <LoadingBlock label="Checking your session…" />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(me.role)) return <Navigate to={homePathFor(me)} replace state={{ denied: location.pathname }} />;
  return <Outlet />;
}

export function RedirectHome() {
  const { status, me } = useAuth();
  if (status === 'loading') return <LoadingBlock className="mx-auto max-w-3xl p-6" />;
  return <Navigate to={homePathFor(me)} replace />;
}
