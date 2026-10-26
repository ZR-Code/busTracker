import type { Notification, PrismaClient } from '@prisma/client';
import type { NotificationCategory, NotificationDto, Paginated } from '@busbuddy/shared';
import { notFound } from '../lib/errors';

export interface NewNotification {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  busId?: string | null;
  stopId?: string | null;
  routeId?: string | null;
  eventKey?: string | null;
  isDemo?: boolean;
}

export class NotificationService {
  private readonly createdListeners = new Set<(n: NewNotification[]) => void>();

  constructor(private readonly prisma: PrismaClient) {}

  onCreated(listener: (n: NewNotification[]) => void): () => void {
    this.createdListeners.add(listener);
    return () => this.createdListeners.delete(listener);
  }

  async createMany(items: NewNotification[]): Promise<number> {
    if (items.length === 0) return 0;
    const res = await this.prisma.notification.createMany({
      data: items.map((n) => ({
        userId: n.userId,
        category: n.category,
        title: n.title,
        body: n.body,
        busId: n.busId ?? null,
        stopId: n.stopId ?? null,
        routeId: n.routeId ?? null,
        eventKey: n.eventKey ?? null,
        isDemo: n.isDemo ?? false,
      })),
      skipDuplicates: true,
    });
    if (res.count > 0) for (const l of this.createdListeners) l(items);
    return res.count;
  }

  async list(
    userId: string,
    q: { limit: number; cursor?: string; category?: NotificationCategory; unread?: boolean },
  ): Promise<Paginated<NotificationDto>> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(q.category ? { category: q.category } : {}), ...(q.unread === undefined ? {} : q.unread ? { readAt: null } : { readAt: { not: null } }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return { items: await this.toDtos(page), nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<NotificationDto> {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    const row = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!row) throw notFound('Notification');
    return (await this.toDtos([row]))[0]!;
  }

  async markAllRead(userId: string): Promise<number> {
    const res = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return res.count;
  }

  private async toDtos(rows: Notification[]): Promise<NotificationDto[]> {
    const ids = (k: 'busId' | 'stopId' | 'routeId') => [...new Set(rows.map((r) => r[k]).filter((v): v is string => Boolean(v)))];
    const [buses, stops, routes] = await Promise.all([
      this.prisma.bus.findMany({ where: { id: { in: ids('busId') } }, select: { id: true, busNumber: true } }),
      this.prisma.stop.findMany({ where: { id: { in: ids('stopId') } }, select: { id: true, name: true } }),
      this.prisma.route.findMany({ where: { id: { in: ids('routeId') } }, select: { id: true, name: true, number: true } }),
    ]);
    const bus = new Map(buses.map((b) => [b.id, b.busNumber]));
    const stop = new Map(stops.map((s) => [s.id, s.name]));
    const route = new Map(routes.map((r) => [r.id, `Route ${r.number} – ${r.name}`]));
    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      body: r.body,
      busId: r.busId,
      busNumber: r.busId ? (bus.get(r.busId) ?? null) : null,
      stopId: r.stopId,
      stopName: r.stopId ? (stop.get(r.stopId) ?? null) : null,
      routeId: r.routeId,
      routeName: r.routeId ? (route.get(r.routeId) ?? null) : null,
      isDemo: r.isDemo,
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt?.toISOString() ?? null,
    }));
  }
}
