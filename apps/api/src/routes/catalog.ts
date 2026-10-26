import { Router, type Request } from 'express';
import { idParamSchema, listQuerySchema, stopPreferenceSchema, type SchoolDto } from '@busbuddy/shared';
import type { AppContext } from '../context';
import { notFound, parse } from '../lib/errors';
import { currentUser, requireAuth, scopeOf } from '../middleware/auth';
import { inScope, scopeWhere } from '../services/access';
import { buildRouteDetail, buildRouteSummaries, stopInclude, toStopDto, visibleRouteIds } from '../services/catalog';

export function catalogRouter(ctx: AppContext): Router {
  const r = Router();
  const { prisma } = ctx;

  r.get('/schools', async (_req, res) => {
    const schools = await prisma.school.findMany({ orderBy: { name: 'asc' } });
    const body: SchoolDto[] = schools.map((s) => ({ id: s.id, name: s.name, address: s.address, timeZone: s.timeZone, lat: s.lat, lng: s.lng, isDemo: s.isDemo }));
    res.json(body);
  });

  r.get('/schools/:id', requireAuth, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const s = await prisma.school.findUnique({ where: { id } });
    if (!s || !inScope(await scopeOf(req), s.id)) throw notFound('School');
    const body: SchoolDto = { id: s.id, name: s.name, address: s.address, timeZone: s.timeZone, lat: s.lat, lng: s.lng, isDemo: s.isDemo };
    res.json(body);
  });

  r.get('/routes', requireAuth, async (req, res) => {
    const q = parse(listQuerySchema, req.query);
    const visible = await visibleRouteIds(ctx, req);
    const search = q.search?.toLowerCase();
    const routes = [...(await ctx.routes.all()).values()]
      .filter((rt) => visible.has(rt.id))
      .filter((rt) => !q.schoolId || rt.schoolId === q.schoolId)
      .filter((rt) => !search || rt.name.toLowerCase().includes(search) || rt.number.toLowerCase() === search || `route ${rt.number}`.includes(search))
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    res.json(await buildRouteSummaries(ctx, routes));
  });

  const loadVisibleRoute = async (req: Request) => {
    const { id } = parse(idParamSchema, req.params);
    const route = await ctx.routes.get(id);
    if (!route || !(await visibleRouteIds(ctx, req)).has(id)) throw notFound('Route');
    return route;
  };

  r.get('/routes/:id', requireAuth, async (req, res) => {
    res.json(await buildRouteDetail(ctx, await loadVisibleRoute(req)));
  });

  r.get('/routes/:id/stops', requireAuth, async (req, res) => {
    const detail = await buildRouteDetail(ctx, await loadVisibleRoute(req));
    res.json(detail.stops);
  });

  r.get('/routes/:id/geometry', requireAuth, async (req, res) => {
    const route = await loadVisibleRoute(req);
    res.json({ routeId: route.id, geometry: route.geometry, source: route.geometrySource });
  });

  r.get('/stops', requireAuth, async (req, res) => {
    const q = parse(listQuerySchema, req.query);
    const user = currentUser(req);
    const visible = await visibleRouteIds(ctx, req);
    const routeFilter = q.routeId ? (visible.has(q.routeId) ? [q.routeId] : []) : [...visible];
    const stops = await prisma.stop.findMany({
      where: {
        ...scopeWhere(await scopeOf(req)),
        routes: { some: { routeId: { in: routeFilter } } },
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }] } : {}),
      },
      include: stopInclude,
      orderBy: { name: 'asc' },
      take: 200,
    });
    const prefs = await prisma.userStopPreference.findMany({ where: { userId: user.id, stopId: { in: stops.map((s) => s.id) } } });
    const byStop = new Map(prefs.map((p) => [p.stopId, p]));
    res.json(stops.map((s) => toStopDto(s, byStop.get(s.id), visible)));
  });

  const loadVisibleStop = async (req: Request) => {
    const { id } = parse(idParamSchema, req.params);
    const visible = await visibleRouteIds(ctx, req);
    const stop = await prisma.stop.findUnique({ where: { id }, include: stopInclude });
    if (!stop || !stop.routes.some((rs) => visible.has(rs.routeId))) throw notFound('Stop');
    return { stop, visible };
  };

  r.get('/stops/:id', requireAuth, async (req, res) => {
    const { stop, visible } = await loadVisibleStop(req);
    const pref = await prisma.userStopPreference.findUnique({ where: { userId_stopId: { userId: currentUser(req).id, stopId: stop.id } } });
    res.json(toStopDto(stop, pref ?? undefined, visible));
  });

  r.put('/stops/:id/preference', requireAuth, async (req, res) => {
    const { stop, visible } = await loadVisibleStop(req);
    const body = parse(stopPreferenceSchema, req.body);
    const userId = currentUser(req).id;
    const pref = await prisma.userStopPreference.upsert({
      where: { userId_stopId: { userId, stopId: stop.id } },
      create: { userId, stopId: stop.id, favorite: body.favorite ?? false, reminderLeadMinutes: body.reminderLeadMinutes ?? null },
      update: {
        ...(body.favorite !== undefined ? { favorite: body.favorite } : {}),
        ...(body.reminderLeadMinutes !== undefined ? { reminderLeadMinutes: body.reminderLeadMinutes } : {}),
      },
    });
    if (!pref.favorite && pref.reminderLeadMinutes === null) {
      await prisma.userStopPreference.delete({ where: { userId_stopId: { userId, stopId: stop.id } } });
    }
    ctx.reminders.invalidateSubscriptions();
    res.json(toStopDto(stop, pref, visible));
  });

  return r;
}
