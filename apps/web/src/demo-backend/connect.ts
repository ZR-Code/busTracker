import type { AuthConfigDto } from '@busbuddy/shared';
import { api, ApiError, setLocalBackend } from '@/lib/api';

const PROBE_TIMEOUT_MS = 5000;
const PROBE_ATTEMPTS = 2;

function serverMissing(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 0 || e.status === 404 || e.status >= 500);
}

export async function loadAuthConfig(): Promise<AuthConfigDto> {
  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt++) {
    try {
      const cfg = await api.get<AuthConfigDto | null>('/auth/config', AbortSignal.timeout(PROBE_TIMEOUT_MS));
      if (cfg && typeof cfg.provider === 'string') return cfg;
      break;
    } catch (e) {
      if (!serverMissing(e)) throw e;
    }
  }
  const { BrowserBackend } = await import('./backend');
  setLocalBackend(new BrowserBackend());
  return api.get<AuthConfigDto>('/auth/config');
}
