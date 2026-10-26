import { Router, type Request } from 'express';
import { historyQuerySchema, idParamSchema, listQuerySchema, liveQuerySchema, type BusLocationDto } from '@busbuddy/shared';
import type { AppContext } from '../context';
import { notFound, parse } from '../lib/errors';
import { currentUser, requireAuth, scopeOf } from '../middleware/auth';
import { inScope } from '../services/access';
import { visibleRouteIds } from '../services/catalog';
import { toBusDto, type BusRecord } from '../services/live-service';

export function busesRouter(ctx: AppContext): Router {
  const r = Router();

  async function visibleBuses(req: Request): Promise<BusRecord[]> {
    const user = currentUser(req);
    const scope = await scopeOf(req);
    const routes = await visibleRouteIds(ctx, req);
    return [...(await ctx.live.buses()).values()].filter((b) =>
      user.role === 'admin' ? inScope(scope, b.schoolId) : b.routeId !== null && routes.has(b.routeId),
    );
  }

  async function loadBus(req: Request): Promise<BusRecord> {
    const { id } = parse(idParamSchema, req.params);
    const bus = (await visibleBuses(req)).find((b) => b.id === id);
    if (!bus) throw notFound('Bus');
    return bus;
  }

  r.get('/buses', requireAuth, async (req, res) => {
    const q = parse(listQuerySchema, req.query);
    const buses = (await visibleBuses(req)).filter((b) => !q.routeId || b.routeId === q.routeId);
    res.json(buses.map((b) => toBusDto(b)));
  });

  r.get('/buses/live', requireAuth, async (req, res) => {
    const q = parse(listQuerySchema, req.query);
    const buses = (await visibleBuses(req)).filter((b) => !q.routeId || b.routeId === q.routeId);
    const results = [];
    for (const b of buses) results.push((await ctx.live.compute(b)).dto);
    res.json(results);
  });

  r.get('/buses/:id', requireAuth, async (req, res) => {
    res.json(toBusDto(await loadBus(req)));
  });

  r.get('/buses/:id/location', requireAuth, async (req, res) => {
    const { dto } = await ctx.live.compute(await loadBus(req));
    res.json({ location: dto.location, freshness: dto.freshness, ageSeconds: dto.ageSeconds });
  });

  r.get('/buses/:id/live', requireAuth, async (req, res) => {
    const q = parse(liveQuerySchema, req.query);
    const { dto } = await ctx.live.compute(await loadBus(req), q.stopId);
    res.set('Cache-Control', 'no-store');
    res.json(dto);
  });

  r.get('/buses/:id/history', requireAuth, async (req, res) => {
    const bus = await loadBus(req);
    const { limit } = parse(historyQuerySchema, req.query);
    const rows = await ctx.prisma.busLocation.findMany({ where: { busId: bus.id }, orderBy: { recordedAt: 'desc' }, take: limit });
    const body: BusLocationDto[] = rows.map((l) => ({ lat: l.lat, lng: l.lng, heading: l.heading, speedMps: l.speedMps, recordedAt: l.recordedAt.toISOString(), dataSource: l.dataSource }));
    res.json(body);
  });

  return r;
}
