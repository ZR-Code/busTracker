import { useEffect, useRef, useState } from 'react';
import type { MeDto } from '@busbuddy/shared';
import { useNotifications } from '@/services/queries';

export type PermissionState = NotificationPermission | 'unsupported';

export function browserNotificationPermission(): PermissionState {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function requestBrowserNotificationPermission(): Promise<PermissionState> {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

export function usePermissionState(): [PermissionState, () => Promise<PermissionState>] {
  const [state, setState] = useState<PermissionState>(browserNotificationPermission);
  const request = async () => {
    const s = await requestBrowserNotificationPermission();
    setState(s);
    return s;
  };
  return [state, request];
}

export function useBrowserNotifications(me: MeDto | null): void {
  const enabled = Boolean(me?.settings.browserNotifications) && browserNotificationPermission() === 'granted';
  const { data } = useNotifications('all');
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data) return;
    if (seen.current === null) {
      seen.current = new Set(data.items.map((n) => n.id));
      return;
    }
    for (const n of data.items) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (enabled && !n.readAt) {
        try {
          new Notification(n.title, { body: n.body, tag: n.id, icon: '/icon-192.png' });
        } catch {
        }
      }
    }
  }, [data, enabled]);
}
