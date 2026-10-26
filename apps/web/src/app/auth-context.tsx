import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthConfigDto, LoginInput, MeDto, SignupInput } from '@busbuddy/shared';
import { api, onUnauthorized } from '@/lib/api';
import { createLocalAuthClient, createSupabaseAuthClient, type AuthClient } from '@/services/auth-client';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  me: MeDto | null;
  config: AuthConfigDto | null;
  configError: boolean;
  signIn(input: LoginInput): Promise<MeDto | null>;
  signUp(input: SignupInput): Promise<{ needsEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  startDemo(persona: 'student' | 'parent'): Promise<MeDto>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  refresh(): Promise<MeDto | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const ME_KEY = ['me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [client, setClient] = useState<AuthClient | null>(null);

  const configQuery = useQuery({ queryKey: ['auth-config'], queryFn: () => api.get<AuthConfigDto>('/auth/config'), staleTime: Infinity, retry: 2 });

  useEffect(() => {
    const cfg = configQuery.data;
    if (!cfg) return;
    let cancelled = false;
    (cfg.provider === 'supabase' && cfg.supabase ? createSupabaseAuthClient(cfg.supabase) : Promise.resolve(createLocalAuthClient())).then((c) => {
      if (!cancelled) setClient(c);
    });
    return () => {
      cancelled = true;
    };
  }, [configQuery.data]);

  const meQuery = useQuery({
    queryKey: ME_KEY,
    enabled: client !== null,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => (await api.get<{ me: MeDto | null }>('/auth/session')).me,
  });

  useEffect(() => {
    onUnauthorized(() => {
      if (qc.getQueryData(ME_KEY)) {
        qc.setQueryData(ME_KEY, null);
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'auth-config' });
      }
    });
  }, [qc]);

  const refresh = useCallback(async () => {
    const me = await api
      .get<{ me: MeDto | null }>('/auth/session')
      .then((r) => r.me)
      .catch(() => null);
    qc.setQueryData(ME_KEY, me);
    return me;
  }, [qc]);

  const resetUserData = useCallback(() => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'auth-config' });
  }, [qc]);

  const need = useCallback(() => {
    if (!client) throw new Error('Authentication is still loading. Please try again in a moment.');
    return client;
  }, [client]);

  const value = useMemo<AuthContextValue>(() => {
    const me = meQuery.data ?? null;
    const status: Status = configQuery.isError ? 'anonymous' : !client || meQuery.isPending ? 'loading' : me ? 'authenticated' : 'anonymous';
    return {
      status,
      me,
      config: configQuery.data ?? null,
      configError: configQuery.isError,
      async signIn(input) {
        await need().signIn(input);
        resetUserData();
        return refresh();
      },
      async signUp(input) {
        const r = await need().signUp(input);
        resetUserData();
        await refresh();
        return r;
      },
      async signOut() {
        await need().signOut().catch(() => {});
        qc.setQueryData(ME_KEY, null);
        resetUserData();
      },
      async startDemo(persona) {
        const result = await need().startDemo(persona);
        resetUserData();
        qc.setQueryData(ME_KEY, result);
        return result;
      },
      requestPasswordReset: (email) => need().requestPasswordReset(email),
      resetPassword: (token, password) => need().resetPassword(token, password),
      refresh,
    };
  }, [meQuery.data, meQuery.isPending, configQuery.data, configQuery.isError, client, need, refresh, resetUserData, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function homePathFor(me: MeDto | null): string {
  if (!me) return '/login';
  if (me.role === 'admin') return '/admin';
  if (me.role === 'parent') return '/parent';
  return '/dashboard';
}
