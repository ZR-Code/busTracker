import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/cn';

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/simulation', label: 'Demo simulation' },
  { to: '/admin/buses', label: 'Buses' },
  { to: '/admin/routes', label: 'Routes' },
  { to: '/admin/stops', label: 'Stops' },
  { to: '/admin/schools', label: 'Schools' },
  { to: '/admin/announcements', label: 'Announcements' },
  { to: '/admin/parent-links', label: 'Parent links' },
  { to: '/admin/analytics', label: 'Analytics' },
];

export function AdminLayout() {
  return (
    <div>
      <nav aria-label="Administration" className="-mx-4 mb-5 overflow-x-auto border-b border-border px-4">
        <ul className="flex min-w-max gap-1">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) => cn('inline-flex h-11 items-center border-b-2 px-3 text-sm font-semibold', isActive ? 'border-brand text-brand-strong' : 'border-transparent text-muted hover:text-text')}
              >
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
