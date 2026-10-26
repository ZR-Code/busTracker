import { AlertTriangle, Ban, Bell, BellOff, BellRing, CheckCheck, Megaphone, Route as RouteIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatRelative, NOTIFICATION_CATEGORY_LABELS, type NotificationCategory, type NotificationDto } from '@busbuddy/shared';
import { useAuth } from '@/app/auth-context';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock, Segmented } from '@/components/ui/feedback';
import { usePermissionState } from '@/hooks/use-browser-notifications';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMarkAllRead, useMarkRead, useNotifications, useUpdateProfile } from '@/services/queries';

const categoryIcon: Record<NotificationCategory, ReactNode> = {
  bus_approaching: <BellRing className="h-5 w-5" aria-hidden />,
  delay: <AlertTriangle className="h-5 w-5" aria-hidden />,
  route_change: <RouteIcon className="h-5 w-5" aria-hidden />,
  service_cancellation: <Ban className="h-5 w-5" aria-hidden />,
  general: <Megaphone className="h-5 w-5" aria-hidden />,
};
const categoryTone: Record<NotificationCategory, string> = {
  bus_approaching: 'bg-success-soft text-success-text',
  delay: 'bg-warning-soft text-warning-text',
  route_change: 'bg-info-soft text-brand-strong',
  service_cancellation: 'bg-danger-soft text-danger-text',
  general: 'bg-surface-muted text-muted',
};

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const category = (params.get('category') as NotificationCategory | null) ?? 'all';
  const q = useNotifications(category);
  const markAll = useMarkAllRead();
  const unread = q.data?.items.filter((n) => !n.readAt).length ?? 0;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Arrival reminders, delays and announcements, newest first."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={unread === 0}
            loading={markAll.isPending}
            onClick={() => markAll.mutate(undefined, { onSuccess: (r) => toast.success(`Marked ${r.updated} as read`), onError: (e) => toast.error(errorMessage(e)) })}
          >
            <CheckCheck className="h-4 w-4" aria-hidden /> Mark all as read
          </Button>
        }
      />
      <BrowserNotificationsPrompt />
      <div className="-mx-4 mb-4 overflow-x-auto px-4">
        <Segmented
          label="Filter by category"
          value={category}
          onChange={(v) =>
            setParams(
              (p) => {
                if (v === 'all') p.delete('category');
                else p.set('category', v);
                return p;
              },
              { replace: true },
            )
          }
          options={[{ value: 'all' as const, label: 'All' }, ...(Object.keys(NOTIFICATION_CATEGORY_LABELS) as NotificationCategory[]).map((c) => ({ value: c, label: NOTIFICATION_CATEGORY_LABELS[c] }))]}
          className="flex-nowrap whitespace-nowrap"
        />
      </div>
      {q.isPending ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title={category === 'all' ? 'You’re all caught up' : `No ${NOTIFICATION_CATEGORY_LABELS[category].toLowerCase()} notifications`}
          description="Set an arrival reminder on your stop to be notified before the bus arrives."
        />
      ) : (
        <ul className="space-y-2" aria-label="Notifications">
          {q.data.items.map((n) => (
            <NotificationCard key={n.id} n={n} />
          ))}
        </ul>
      )}
    </>
  );
}

export function NotificationCard({ n }: { n: NotificationDto }) {
  const mark = useMarkRead();
  const unread = !n.readAt;
  return (
    <li>
      <Card className={cn('flex gap-3 p-4', unread && 'border-brand/40 bg-info-soft/40')}>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', categoryTone[n.category])}>{categoryIcon[n.category]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn('text-sm', unread ? 'font-bold' : 'font-semibold')}>{n.title}</p>
            {unread && <Badge tone="info">Unread</Badge>}
            {n.isDemo && <Badge tone="demo">Demo</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-text/90">{n.body}</p>
          <p className="mt-1 text-xs text-muted">
            {NOTIFICATION_CATEGORY_LABELS[n.category]}
            {n.routeName && ` · ${n.routeName}`}
            {n.stopName && ` · ${n.stopName}`}
            {n.busNumber && ` · Bus ${n.busNumber}`} · <time dateTime={n.createdAt}>{formatRelative(n.createdAt)}</time>
          </p>
        </div>
        {unread && (
          <Button variant="ghost" size="sm" className="shrink-0 self-center" loading={mark.isPending} onClick={() => mark.mutate(n.id)} aria-label={`Mark “${n.title}” as read`}>
            Mark read
          </Button>
        )}
      </Card>
    </li>
  );
}

export function BrowserNotificationsPrompt({ inline }: { inline?: boolean }) {
  const { me } = useAuth();
  const [permission, request] = usePermissionState();
  const update = useUpdateProfile();
  if (!me) return null;
  const enabled = me.settings.browserNotifications && permission === 'granted';
  if (!inline && (enabled || permission === 'unsupported')) return null;

  const enable = async () => {
    const result = permission === 'granted' ? 'granted' : await request();
    if (result === 'granted') {
      update.mutate({ settings: { browserNotifications: true } }, { onSuccess: () => toast.success('Browser notifications on', { description: 'Shown while BusBuddy is open in a tab.' }) });
    } else if (result === 'denied') {
      toast.error('Notifications are blocked', { description: 'Allow notifications for this site in your browser settings, then try again.' });
    }
  };

  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between', !inline && 'mb-4')}>
      <div className="flex gap-3 text-sm">
        {permission === 'denied' ? <BellOff className="h-5 w-5 shrink-0 text-warning-text" aria-hidden /> : <BellRing className="h-5 w-5 shrink-0 text-brand" aria-hidden />}
        <div>
          <p className="font-semibold">
            {permission === 'unsupported' ? 'Browser notifications aren’t supported here' : permission === 'denied' ? 'Browser notifications are blocked' : enabled ? 'Browser notifications are on' : 'Get alerts outside this page'}
          </p>
          <p className="text-muted">
            {permission === 'denied'
              ? 'You can still see every alert here. To allow them, change this site’s notification setting in your browser.'
              : 'Browser notifications appear while BusBuddy is open in a tab. Alerts when the app is closed need push notifications, which this deployment hasn’t enabled.'}
          </p>
        </div>
      </div>
      {permission !== 'unsupported' && permission !== 'denied' && (
        enabled ? (
          <Button variant="outline" size="sm" onClick={() => update.mutate({ settings: { browserNotifications: false } }, { onSuccess: () => toast.success('Browser notifications off') })} loading={update.isPending}>
            Turn off
          </Button>
        ) : (
          <Button size="sm" onClick={enable} loading={update.isPending}>
            Enable browser notifications
          </Button>
        )
      )}
    </div>
  );
}
