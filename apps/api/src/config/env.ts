import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const envFile = resolve(ROOT, '.env');
if (existsSync(envFile)) loadDotenv({ path: envFile });

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));
const int = (def: number, min = 0) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return def;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `must be an integer >= ${min}` });
        return z.NEVER;
      }
      return n;
    });
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: int(4000, 1),
    ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
    DATABASE_URL: z.string().url('DATABASE_URL must be a PostgreSQL connection string'),
    AUTH_PROVIDER: z.enum(['local', 'supabase']).default('local'),
    SUPABASE_URL: optionalString,
    SUPABASE_ANON_KEY: optionalString,
    SESSION_TTL_HOURS: int(168, 1),
    DEMO_MODE_ENABLED: bool(true),
    DEMO_SESSION_TTL_HOURS: int(24, 1),
    ALLOW_SELF_ROUTE_ASSIGNMENT: bool(true),
    LOCATION_STALE_SECONDS: int(90, 5),
    LOCATION_HISTORY_RETENTION_MINUTES: int(120, 1),
    SIMULATION_ENABLED: bool(true),
    SIMULATION_TICK_MS: int(1000, 100),
    SIMULATION_RESTART_DELAY_SECONDS: int(90, 0),
    DISTRICT_GPS_BASE_URL: optionalString,
    DISTRICT_GPS_API_KEY: optionalString,
    DISTRICT_GPS_POLL_SECONDS: int(10, 2),
    GPS_INGEST_API_KEY: optionalString,
    AUTH_RATE_LIMIT_MAX: int(20, 1),
    WEB_APP_URL: z.string().default('http://localhost:5173'),
  })
  .superRefine((v, ctx) => {
    if (v.AUTH_PROVIDER === 'supabase' && (!v.SUPABASE_URL || !v.SUPABASE_ANON_KEY)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SUPABASE_URL'], message: 'AUTH_PROVIDER=supabase requires SUPABASE_URL and SUPABASE_ANON_KEY' });
    }
    if (v.GPS_INGEST_API_KEY && v.GPS_INGEST_API_KEY.length < 24) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['GPS_INGEST_API_KEY'], message: 'must be at least 24 characters' });
    }
  });

export type Env = z.infer<typeof schema> & {
  allowedOrigins: string[];
  isProduction: boolean;
  districtGpsConfigured: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}\nRun npm run setup to create .env.`);
  }
  const v = parsed.data;
  return {
    ...v,
    allowedOrigins: v.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    isProduction: v.NODE_ENV === 'production',
    districtGpsConfigured: Boolean(v.DISTRICT_GPS_BASE_URL && v.DISTRICT_GPS_API_KEY),
  };
}

export function describeDisabledFeatures(env: Env): string[] {
  const notes: string[] = [];
  if (env.AUTH_PROVIDER === 'local') notes.push('Auth: local email/password accounts (Supabase Auth not configured).');
  if (!env.districtGpsConfigured) notes.push('District GPS adapter: not configured (DISTRICT_GPS_BASE_URL / DISTRICT_GPS_API_KEY).');
  if (!env.GPS_INGEST_API_KEY) notes.push('GPS ingest endpoint: disabled (GPS_INGEST_API_KEY not set).');
  if (!env.SIMULATION_ENABLED) notes.push('Demo simulation: disabled.');
  notes.push('Push notifications: not configured (in-app and open-tab browser notifications only).');
  notes.push('Password reset email: not configured; reset links are written to the server log in development.');
  return notes;
}
