import type { PrismaClient } from '@prisma/client';
import type { Env } from './config/env';
import { SupabaseAuthVerifier } from './auth/supabase';
import { logger } from './lib/logger';
import { DistrictGpsProvider, ManualTestProvider } from './providers/db-providers';
import { ProviderRegistry } from './providers/registry';
import { SimulationProvider } from './providers/simulation-provider';
import { AnnouncementService } from './services/announcements';
import { DemoService } from './services/demo';
import { LiveService } from './services/live-service';
import { NotificationService } from './services/notifications';
import { ReminderEngine } from './services/reminder-engine';
import { RouteCache } from './services/route-cache';

export interface AppContext {
  env: Env;
  prisma: PrismaClient;
  routes: RouteCache;
  providers: ProviderRegistry;
  live: LiveService;
  notifications: NotificationService;
  reminders: ReminderEngine;
  announcements: AnnouncementService;
  demo: DemoService;
  supabase: SupabaseAuthVerifier | null;
  catalogChanged(): Promise<void>;
}

export function createContext(env: Env, prisma: PrismaClient, opts: { manualTicks?: boolean } = {}): AppContext {
  const routes = new RouteCache(prisma);
  const simulation = new SimulationProvider(prisma, routes, {
    enabled: env.SIMULATION_ENABLED,
    tickMs: env.SIMULATION_TICK_MS,
    restartDelaySeconds: env.SIMULATION_RESTART_DELAY_SECONDS,
    autoResetAfterMinutes: 30,
    manualTicks: opts.manualTicks,
  });
  const providers = new ProviderRegistry(
    simulation,
    new ManualTestProvider(prisma),
    new DistrictGpsProvider(prisma, { baseUrl: env.DISTRICT_GPS_BASE_URL, apiKey: env.DISTRICT_GPS_API_KEY, pollSeconds: env.DISTRICT_GPS_POLL_SECONDS }),
  );
  const live = new LiveService(prisma, routes, providers, { staleAfterSeconds: env.LOCATION_STALE_SECONDS });
  const notifications = new NotificationService(prisma);
  const ctx: AppContext = {
    env,
    prisma,
    routes,
    providers,
    live,
    notifications,
    reminders: new ReminderEngine(prisma, live, notifications, { intervalMs: 3000 }),
    announcements: new AnnouncementService(prisma, notifications),
    demo: new DemoService(prisma, { ttlHours: env.DEMO_SESSION_TTL_HOURS }),
    supabase: env.AUTH_PROVIDER === 'supabase' && env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? new SupabaseAuthVerifier(prisma, env.SUPABASE_URL, env.SUPABASE_ANON_KEY) : null,
    async catalogChanged() {
      routes.invalidate();
      live.invalidate();
      await simulation.reload();
    },
  };
  return ctx;
}

export async function pruneLocationHistory(prisma: PrismaClient, retentionMinutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionMinutes * 60_000);
  return prisma.$executeRaw`
    DELETE FROM "BusLocation" b
    WHERE b."recordedAt" < ${cutoff}
      AND b.id NOT IN (SELECT DISTINCT ON ("busId") id FROM "BusLocation" ORDER BY "busId", "recordedAt" DESC)`;
}

export async function startBackgroundJobs(ctx: AppContext): Promise<() => Promise<void>> {
  await ctx.providers.startAll();
  ctx.reminders.start();
  ctx.live.startStatusSync();
  const maintenance = async () => {
    try {
      await ctx.demo.cleanup();
      await ctx.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await pruneLocationHistory(ctx.prisma, ctx.env.LOCATION_HISTORY_RETENTION_MINUTES);
    } catch (e) {
      logger.warn('Maintenance job failed', { error: e instanceof Error ? e.message : String(e) });
    }
  };
  await maintenance();
  const timer = setInterval(() => void maintenance(), 10 * 60_000);
  return async () => {
    clearInterval(timer);
    ctx.reminders.stop();
    ctx.live.stopStatusSync();
    await ctx.providers.stopAll();
  };
}
