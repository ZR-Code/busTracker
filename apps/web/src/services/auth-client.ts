import type { AuthConfigDto, LoginInput, MeDto, SignupInput } from '@busbuddy/shared';
import { api, setAccessTokenSource } from '@/lib/api';

export interface AuthClient {
  provider: AuthConfigDto['provider'];
  signIn(input: LoginInput): Promise<void>;
  signUp(input: SignupInput): Promise<{ needsEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  startDemo(persona: 'student' | 'parent'): Promise<MeDto>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
}

const startDemo = (persona: 'student' | 'parent') => api.post<MeDto>('/auth/demo', { persona });

export function createLocalAuthClient(): AuthClient {
  setAccessTokenSource(null);
  return {
    provider: 'local',
    async signIn(input) {
      await api.post('/auth/login', input);
    },
    async signUp(input) {
      await api.post('/auth/signup', input);
      return { needsEmailConfirmation: false };
    },
    async signOut() {
      await api.post('/auth/logout');
    },
    startDemo,
    async requestPasswordReset(email) {
      await api.post('/auth/forgot-password', { email });
    },
    async resetPassword(token, password) {
      await api.post('/auth/reset-password', { token, password });
    },
  };
}

export async function createSupabaseAuthClient(config: NonNullable<AuthConfigDto['supabase']>): Promise<AuthClient> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(config.url, config.anonKey);
  setAccessTokenSource(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
  const raise = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  return {
    provider: 'supabase',
    async signIn(input) {
      raise((await supabase.auth.signInWithPassword(input)).error);
    },
    async signUp(input) {
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: { name: input.name, role: input.role, schoolId: input.schoolId } },
      });
      raise(error);
      return { needsEmailConfirmation: !data.session };
    },
    async signOut() {
      await api.post('/auth/logout').catch(() => {});
      raise((await supabase.auth.signOut()).error);
    },
    startDemo,
    async requestPasswordReset(email) {
      raise((await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })).error);
    },
    async resetPassword(_token, password) {
      raise((await supabase.auth.updateUser({ password })).error);
    },
  };
}
