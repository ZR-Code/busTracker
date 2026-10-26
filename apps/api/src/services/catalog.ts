import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { BusStatus, RouteDetailDto, RouteServiceStatus, RouteSummaryDto, StopDto } from '@busbuddy/shared';
import type { AppContext } from '../context';
import { currentUser, scopeOf } from '../middleware/auth';
import { scopeWhere } from './access';
import type { CachedRoute } from './route-cache';

export async function visibleRouteWhere(ctx: AppContext, req: Request): Promise<Prisma.RouteWhereInput> {
  const user = currentUser(req);
  const scope = await scopeOf(req);
  const base = scopeWhere(scope);
  if (user.role === 'admin' || ctx.env.ALLOW_SELF_ROUTE_ASSIGNMENT) return base;
  if (user.role === 'student') {
    const p = await ctx.prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { assignedRouteId: true } });
    return { ...base, id: p?.assignedRouteId ?? '__none__' };
  }
  const links = await ctx.prisma.parentStudentRelationship.findMany({
    where: { parentId: user.id, status: 'verified' },
    select: { student: { select: { studentProfile: { select: { assignedRouteId: true } } } } },
  });
  const ids = links.map((l) => l.student.studentProfile?.assignedRouteId).filter((v): v is string => Boolean(v));
  return { ...base, id: { in: ids } };
}

export async function visibleRouteIds(ctx: AppContext, req: Request): Promise<Set<string>> {
  const rows = await ctx.prisma.route.findMany({ where: await visibleRouteWhere(ctx, req), select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

export async function activeDisruptions(ctx: AppContext): Promise<Map<string, 'delayed' | 'disrupted'>> {
  const now = new Date();
  const rows = await ctx.prisma.announcementRoute.findMany({
    where: {
      announcement: {
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [{ OR: [{ category: { in: ['delay', 'service_cancellation'] } }, { severity: 'critical' }] }],
      },
    },
    select: { routeId: true, announcement: { select: { category: true, severity: true } } },
  });
  const out = new Map<string, 'delayed' | 'disrupted'>();
  for (const r of rows) {
    const kind = r.announcement.category === 'service_cancellation' || r.announcement.severity === 'critical' ? 'disrupted' : 'delayed';
    if (out.get(r.routeId) !== 'disrupted') out.set(r.routeId, kind);
  }
  return out;
}

export function serviceStatusFor(route: CachedRoute, busStatuses: BusStatus[], disruption: 'delayed' | 'disrupted' | undefined): RouteServiceStatus {
  if (!route.active) return 'inactive';
  if (disruption === 'disrupted') return 'disrupted';
  if (disruption === 'delayed' || busStatuses.includes('delayed')) return 'delayed';
  const operating = busStatuses.filter((s) => s !== 'out_of_service');
  if (operating.length > 0 && operating.every((s) => s === 'completed')) return 'completed';
  return 'normal';
}

export async function buildRouteSummaries(ctx: AppContext, routes: CachedRoute[]): Promise<RouteSummaryDto[]> {
  const [buses, disruptions, schools] = await Promise.all([
    ctx.live.buses(),
    activeDisruptions(ctx),
    ctx.prisma.school.findMany({ where: { id: { in: [...new Set(routes.map((r) => r.schoolId))] } }, select: { id: true, name: true } }),
  ]);
  const schoolName = new Map(schools.map((s) => [s.id, s.name]));
  return routes.map((r) => {
    const routeBuses = [...buses.values()].filter((b) => b.routeId === r.id);
    return {
      id: r.id,
      name: r.name,
      number: r.number,
      schoolId: r.schoolId,
      schoolName: schoolName.get(r.schoolId) ?? '',
      active: r.active,
      color: r.color,
      scheduledStartTime: r.scheduledStartTime,
      scheduledEndTime: r.scheduledEndTime,
      stopCount: r.stops.length,
      firstPickupTime: r.stops[0]?.scheduledArrivalTime ?? null,
      buses: routeBuses.map((b) => ({ id: b.id, busNumber: b.busNumber, status: b.status })),
      serviceStatus: serviceStatusFor(r, routeBuses.map((b) => b.status), disruptions.get(r.id)),
      isDemo: r.isDemo,
    };
  });
}

export async function buildRouteDetail(ctx: AppContext, route: CachedRoute): Promise<RouteDetailDto> {
  const [summary] = await buildRouteSummaries(ctx, [route]);
  return {
    ...summary!,
    geometry: route.geometry,
    geometrySource: route.geometrySource,
    lengthMeters: Math.round(route.path?.lengthMeters ?? 0),
    stops: route.stops.map((s) => ({
      stopId: s.stopId,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      description: s.description,
      order: s.order,
      scheduledArrivalTime: s.scheduledArrivalTime,
      scheduledDepartureTime: s.scheduledDepartureTime,
      distanceAlongMeters: Math.round(s.distanceAlongMeters),
    })),
  };
}

const stopInclude = { routes: { include: { route: { select: { id: true, name: true, number: true } } } } } satisfies Prisma.StopInclude;
export type StopRow = Prisma.StopGetPayload<{ include: typeof stopInclude }>;
export { stopInclude };

export function toStopDto(s: StopRow, pref: { favorite: boolean; reminderLeadMinutes: number | null } | undefined, visibleRoutes?: Set<string>): StopDto {
  return {
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    description: s.description,
    schoolId: s.schoolId,
    routes: s.routes.filter((r) => !visibleRoutes || visibleRoutes.has(r.routeId)).map((r) => r.route),
    favorite: pref?.favorite ?? false,
    reminderLeadMinutes: pref?.reminderLeadMinutes ?? null,
  };
}
