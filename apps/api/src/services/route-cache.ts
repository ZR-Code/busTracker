import type { PrismaClient } from '@prisma/client';
import { buildRoutePath, minutesFromTimeOfDay, projectStopsInOrder, straightLineGeometry, type LatLngTuple, type RoutePath } from '@busbuddy/shared';

export interface CachedRouteStop {
  stopId: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  order: number;
  scheduledArrivalTime: string;
  scheduledDepartureTime: string;
  distanceAlongMeters: number;
  scheduleOffsetSeconds: number;
}

export interface CachedRoute {
  id: string;
  name: string;
  number: string;
  schoolId: string;
  timeZone: string;
  color: string;
  active: boolean;
  scheduledStartTime: string;
  scheduledEndTime: string;
  isDemo: boolean;
  geometry: LatLngTuple[];
  geometrySource: 'stored' | 'straight_line';
  path: RoutePath | null;
  stops: CachedRouteStop[];
}

function parseGeometry(value: unknown): LatLngTuple[] | null {
  if (!Array.isArray(value)) return null;
  const pts: LatLngTuple[] = [];
  for (const p of value) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') pts.push([p[0], p[1]]);
  }
  return pts.length >= 2 ? pts : null;
}

export class RouteCache {
  private cache: Map<string, CachedRoute> | null = null;
  private loading: Promise<Map<string, CachedRoute>> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly prisma: PrismaClient) {}

  invalidate(): void {
    this.cache = null;
    this.loading = null;
    for (const l of this.listeners) l();
  }

  onInvalidate(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async all(): Promise<Map<string, CachedRoute>> {
    if (this.cache) return this.cache;
    if (!this.loading) {
      this.loading = this.load().then((m) => {
        this.cache = m;
        return m;
      });
    }
    return this.loading;
  }

  async get(routeId: string): Promise<CachedRoute | undefined> {
    return (await this.all()).get(routeId);
  }

  private async load(): Promise<Map<string, CachedRoute>> {
    const routes = await this.prisma.route.findMany({
      include: { school: { select: { timeZone: true } }, stops: { include: { stop: true }, orderBy: { stopOrder: 'asc' } } },
    });
    const out = new Map<string, CachedRoute>();
    for (const r of routes) {
      const stopPoints = r.stops.map((rs) => [rs.stop.lat, rs.stop.lng] as LatLngTuple);
      const stored = parseGeometry(r.geometry);
      const geometry = stored ?? (stopPoints.length >= 2 ? straightLineGeometry(stopPoints) : []);
      const path = geometry.length >= 2 ? buildRoutePath(geometry) : null;
      const distances = path ? projectStopsInOrder(path, stopPoints) : stopPoints.map(() => 0);
      const startMin = minutesFromTimeOfDay(r.scheduledStartTime);
      out.set(r.id, {
        id: r.id,
        name: r.name,
        number: r.number,
        schoolId: r.schoolId,
        timeZone: r.school.timeZone,
        color: r.color,
        active: r.active,
        scheduledStartTime: r.scheduledStartTime,
        scheduledEndTime: r.scheduledEndTime,
        isDemo: r.isDemo,
        geometry,
        geometrySource: stored ? 'stored' : 'straight_line',
        path,
        stops: r.stops.map((rs, i) => ({
          stopId: rs.stopId,
          name: rs.stop.name,
          description: rs.stop.description,
          lat: rs.stop.lat,
          lng: rs.stop.lng,
          order: rs.stopOrder,
          scheduledArrivalTime: rs.scheduledArrivalTime,
          scheduledDepartureTime: rs.scheduledDepartureTime,
          distanceAlongMeters: distances[i] ?? 0,
          scheduleOffsetSeconds: Math.max(0, (minutesFromTimeOfDay(rs.scheduledArrivalTime) - startMin) * 60),
        })),
      });
    }
    return out;
  }
}
