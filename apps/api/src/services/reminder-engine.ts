import type { PrismaClient } from '@prisma/client';
import { delayEventKey, ETA_THRESHOLDS, FiredEventTracker, reminderEventKey, reminderMessage, shouldFireReminder } from '@busbuddy/shared';
import { logger } from '../lib/logger';
import { recipientsForRoutes } from './audience';
import type { LiveService } from './live-service';
import type { NewNotification, NotificationService } from './notifications';

interface Subscription {
  userId: string;
  stopId: string;
  leadMinutes: number;
}

export class ReminderEngine {
  readonly tracker = new FiredEventTracker();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private subs: { at: number; items: Subscription[] } | null = null;
  private readonly audience = new Map<string, { at: number; ids: string[] }>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly live: LiveService,
    private readonly notifications: NotificationService,
    private readonly opts: { intervalMs: number },
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.run(), this.opts.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  invalidateSubscriptions(): void {
    this.subs = null;
  }

  private async subscriptions(): Promise<Subscription[]> {
    if (this.subs && Date.now() - this.subs.at < 10_000) return this.subs.items;
    const rows = await this.prisma.userStopPreference.findMany({
      where: { reminderLeadMinutes: { not: null }, user: { OR: [{ settings: { remindersEnabled: true } }, { settings: null }] } },
      select: { userId: true, stopId: true, reminderLeadMinutes: true },
    });
    const items = rows.map((r) => ({ userId: r.userId, stopId: r.stopId, leadMinutes: r.reminderLeadMinutes! }));
    this.subs = { at: Date.now(), items };
    return items;
  }

  private async routeAudience(routeId: string): Promise<string[]> {
    const cached = this.audience.get(routeId);
    if (cached && Date.now() - cached.at < 30_000) return cached.ids;
    const ids = await recipientsForRoutes(this.prisma, [routeId]);
    this.audience.set(routeId, { at: Date.now(), ids });
    return ids;
  }

  async run(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const results = await this.live.computeMany((b) => b.routeId !== null && b.status !== 'out_of_service');
      const subs = await this.subscriptions();
      const byStop = new Map<string, Subscription[]>();
      for (const s of subs) byStop.set(s.stopId, [...(byStop.get(s.stopId) ?? []), s]);

      const pending: NewNotification[] = [];
      for (const r of results) {
        const { dto } = r;
        if (!dto.tripId) continue;
        const isDemo = dto.location?.dataSource === 'demo_simulation';
        const suffix = isDemo ? ' (Demo simulation — not a real bus.)' : '';

        for (const stop of dto.stops) {
          for (const sub of byStop.get(stop.stopId) ?? []) {
            if (!shouldFireReminder({ etaSeconds: stop.etaSeconds, leadMinutes: sub.leadMinutes, stopState: stop.state, freshness: dto.freshness })) continue;
            const eventKey = reminderEventKey({ tripId: dto.tripId, busId: dto.bus.id, stopId: stop.stopId, leadMinutes: sub.leadMinutes });
            if (!this.tracker.markIfNew(`${sub.userId}|${eventKey}`)) continue;
            const msg = reminderMessage(dto.bus.busNumber, stop.name, stop.etaSeconds!);
            pending.push({
              userId: sub.userId,
              category: 'bus_approaching',
              title: msg.title,
              body: msg.body + suffix,
              busId: dto.bus.id,
              stopId: stop.stopId,
              routeId: dto.bus.routeId,
              eventKey,
              isDemo,
            });
          }
        }

        const fresh = dto.freshness !== 'stale' && dto.freshness !== 'unavailable';
        if (fresh && dto.bus.routeId && (dto.deviationSeconds ?? 0) >= ETA_THRESHOLDS.delayedSeconds) {
          const eventKey = delayEventKey(dto.tripId, dto.bus.id);
          const minutes = Math.round((dto.deviationSeconds ?? 0) / 60);
          for (const userId of await this.routeAudience(dto.bus.routeId)) {
            if (!this.tracker.markIfNew(`${userId}|${eventKey}`)) continue;
            pending.push({
              userId,
              category: 'delay',
              title: `Bus ${dto.bus.busNumber} is running late`,
              body: `Bus ${dto.bus.busNumber} on Route ${dto.bus.routeNumber} is about ${minutes} minutes behind schedule. Arrival times are estimates.${suffix}`,
              busId: dto.bus.id,
              routeId: dto.bus.routeId,
              eventKey,
              isDemo,
            });
          }
        }
      }
      return await this.notifications.createMany(pending);
    } catch (e) {
      logger.warn('Reminder engine pass failed', { error: e instanceof Error ? e.message : String(e) });
      return 0;
    } finally {
      this.running = false;
    }
  }
}
