import { Bell, Bus, FlaskConical, Home, LayoutDashboard, ListOrdered, LogOut, MapPin, Navigation, Settings, Shield, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Role } from '@busbuddy/shared';
import { useAuth } from '@/app/auth-context';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { useBrowserNotifications } from '@/hooks/use-browser-notifications';
import { cn } from '@/lib/cn';
import { useUnreadCount } from '@/services/queries';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
  mobile?: boolean;
}

const icon = (C: typeof Home) => <C className="h-5 w-5" aria-hidden />;

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: icon(Home), roles: ['student'], mobile: true },
  { to: '/parent', label: 'My students', icon: icon(Users), roles: ['parent'], mobile: true },
  { to: '/admin', label: 'Admin', icon: icon(Shield), roles: ['admin'], mobile: true },
  { to: '/track', label: 'Track a bus', icon: icon(Navigation), roles: ['student', 'parent', 'admin'], mobile: true },
  { to: '/routes', label: 'Routes', icon: icon(ListOrdered), roles: ['student', 'parent', 'admin'], mobile: true },
  { to: '/stops', label: 'Stops', icon: icon(MapPin), roles: ['student', 'parent', 'admin'], mobile: true },
  { to: '/notifications', label: 'Notifications', icon: icon(Bell), roles: ['student', 'parent', 'admin'], mobile: true },
  { to: '/settings', label: 'Settings', icon: icon(Settings), roles: ['student', 'parent', 'admin'] },
];

export function AppShell() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const unread = useUnreadCount(Boolean(me)).data?.count ?? 0;
  useBrowserNotifications(me);
  if (!me) return null;
  const items = NAV.filter((n) => n.roles.includes(me.role));

  const onSignOut = async () => {
    await signOut();
    toast.success(me.isDemo ? 'Demo session ended' : 'Signed out');
    navigate(me.isDemo ? '/' : '/login');
  };

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-[2000] rounded bg-surface px-4 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to main content
      </a>
      {me.isDemo && (
        <div className="bg-demo-soft text-demo">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                Demo session — fictional district, simulated buses. <span className="hidden font-normal sm:inline">Your changes are private to this session and expire in 24 hours.</span>
              </span>
            </p>
            <button type="button" onClick={onSignOut} className="shrink-0 rounded-md px-2 py-1 font-semibold underline underline-offset-2 hover:bg-demo/10">
              Exit demo
            </button>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-[900] border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <NavLink to="/" aria-label="BusBuddy home">
            <Logo />
          </NavLink>
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden text-sm text-muted md:inline">
              {me.name}
              <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold capitalize">{me.role}</span>
            </span>
            <NavLink to="/notifications" className={({ isActive }) => cn('relative flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-muted', isActive && 'text-brand')} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <Bell className="h-5 w-5" aria-hidden />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-5 text-white" aria-hidden>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
            <NavLink to="/settings" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-muted lg:hidden" aria-label="Settings">
              <Settings className="h-5 w-5" aria-hidden />
            </NavLink>
            <Button variant="ghost" size="icon" onClick={onSignOut} aria-label={me.isDemo ? 'Exit demo' : 'Sign out'} title={me.isDemo ? 'Exit demo' : 'Sign out'}>
              <LogOut className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 pb-24 pt-5 lg:pb-10">
        <nav aria-label="Main" className="sticky top-24 hidden h-fit w-56 shrink-0 lg:block">
          <ul className="space-y-1">
            {items.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === '/admin' ? false : undefined}
                  className={({ isActive }) =>
                    cn('flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-text', isActive && 'bg-surface text-brand-strong shadow-sm ring-1 ring-border')
                  }
                >
                  {n.icon}
                  {n.label}
                  {n.to === '/notifications' && unread > 0 && <span className="ml-auto rounded-full bg-danger px-1.5 text-xs font-bold text-white">{unread}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
          {me.studentProfile && (
            <div className="mt-6 rounded-xl border border-border bg-surface p-3 text-xs text-muted">
              <p className="flex items-center gap-1.5 font-semibold text-text">
                <Bus className="h-4 w-4" aria-hidden /> {me.studentProfile?.schoolName ?? 'BusBuddy'}
              </p>
              {me.studentProfile?.assignedRouteName && <p className="mt-1">{me.studentProfile.assignedRouteName}</p>}
            </div>
          )}
        </nav>
        <main id="main" className="min-w-0 flex-1" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[900] border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {items
            .filter((n) => n.mobile)
            .slice(0, 5)
            .map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted', isActive && 'text-brand-strong')}
                >
                  {n.to === '/admin' ? <LayoutDashboard className="h-5 w-5" aria-hidden /> : n.icon}
                  <span className="max-w-full truncate px-1">{n.label.replace('Track a bus', 'Track').replace('Notifications', 'Alerts').replace('My students', 'Family')}</span>
                </NavLink>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
