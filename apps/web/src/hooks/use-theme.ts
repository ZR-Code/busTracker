import { useEffect } from 'react';
import type { ThemePreference } from '@busbuddy/shared';

export function useThemeSync(theme: ThemePreference | undefined): void {
  useEffect(() => {
    const pref = theme ?? 'system';
    try {
      window.localStorage.setItem('busbuddy:theme', pref);
    } catch {
    }
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const apply = () => document.documentElement.classList.toggle('dark', pref === 'dark' || (pref === 'system' && Boolean(mq?.matches)));
    apply();
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [theme]);
}
