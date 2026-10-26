import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import {
  announcementInputSchema,
  BUS_STATUSES,
  busInputSchema,
  idParamSchema,
  manualLocationSchema,
  routeInputSchema,
  routeStopsInputSchema,
  schoolInputSchema,
  simulationSpeedSchema,
  stopInputSchema,
  type AdminOverviewDto,
  type AdminParentLinkDto,
  type AnalyticsDto,
  type AuditEntryDto,
  type BusStatus,
} from '@busbuddy/shared';
import { DEMO_SCHOOL_ID } from '@busbuddy/shared/demo';
import type { AppContext } from '../context';
import { badRequest, conflict, forbidden, HttpError, notFound, parse } from '../lib/errors';
import { currentUser, requireRole, scopeOf } from '../middleware/auth';
import { assertAdminCanManage, inScope, scopeWhere } from '../services/access';
import { audit } from '../services/audit';
import { buildRouteDetail, buildRouteSummaries, stopInclude, toStopDto } from '../services/catalog';
import { toBusDto } from '../services/live-service';

const SIM_DEFAULTS = { initialProgressMeters: 0, initialPhase: 'waiting' as const, startDelaySeconds: 30, cruiseSpeedMps: 10, speedFactor: 1, autoRestart: true, initialDelaySeconds: 0 };

export function adminRouter(ctx: AppContext): Router {
  const r = Router();
  const { prisma } = ctx;
  r.use(
    '/admin',
    rateLimit({ windowMs: 15 * 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false }),
    requireRole('admin'),
  );

  const actor = (req: Request) => currentUser(req);
  const scoped = async (req: Request) => scopeWhere(await scopeOf(req));
  const idOf = (req: Request) => parse(idParamSchema, req.params).id;

  async function activity(limit = 20): Promise<AuditEntryDto[]> {
    const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit, include: { actor: { select: { name: true } } } });
    return rows.map((a) => ({ id: a.id, action: a.action, summary: a.summary, actorName: a.actor?.name ?? null, createdAt: a.createdAt.toISOString() }));
  }

  r.get('/admin/overview', async (req, res) => {
    const scope = await scopeOf(req);
    const where = scopeWhere(scope);
    const buses = [...(await ctx.live.buses()).values()].filter((b) => inScope(scope, b.schoolId));
    const routes = [...(await ctx.routes.all()).values()].filter((rt) => inScope(scope, rt.schoolId));
    const summaries = await buildRouteSummaries(ctx, routes);
    const now = new Date();
    const [totalStops, activeAlerts, pendingParentLinks] = await Promise.all([
      prisma.stop.count({ where }),
      prisma.serviceAnnouncement.count({ where: { ...where, publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
      prisma.parentStudentRelationship.count({ where: { status: 'pending', student: { isDemo: false, ...(scope.all ? {} : { studentProfile: { schoolId: { in: scope.ids } } }) } } }),
    ]);
    const counts = new Map<BusStatus, number>();
    for (const b of buses) counts.set(b.status, (counts.get(b.status) ?? 0) + 1);
    const activeStatuses: BusStatus[] = ['in_transit', 'approaching_stop', 'at_stop', 'delayed'];
    const body: AdminOverviewDto = {
      counts: {
        activeBuses: buses.filter((b) => activeStatuses.includes(b.status)).length,
        totalBuses: buses.length,
        activeRoutes: routes.filter((rt) => rt.active).length,
        totalRoutes: routes.length,
        totalStops,
        activeAlerts,
        pendingParentLinks,
      },
      busStatus: BUS_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 })),
      routeStatus: summaries.map((s) => ({ id: s.id, name: s.name, number: s.number, serviceStatus: s.serviceStatus, busNumbers: s.buses.map((b) => b.busNumber) })),
      activity: await activity(),
      providers: ctx.providers.statuses(),
    };
    res.json(body);
  });

  r.get('/admin/activity', async (_req, res) => {
    res.json(await activity(100));
  });

  r.get('/admin/analytics', async (req, res) => {
    const scope = await scopeOf(req);
    const results = await ctx.live.computeMany((b) => inScope(scope, b.schoolId) && b.routeId !== null && b.dataSource === 'demo_simulation');
    const measured = results.filter((x) => x.dto.adherence !== 'unknown');
    const onTime = measured.filter((x) => x.dto.adherence !== 'late').length;
    const deviations = measured.map((x) => x.dto.deviationSeconds ?? 0);
    const routes = [...(await ctx.routes.all()).values()].filter((rt) => inScope(scope, rt.schoolId));
    const body: AnalyticsDto = {
      isSimulated: true,
      generatedAt: new Date().toISOString(),
      onTimePercentage: measured.length ? Math.round((onTime / measured.length) * 100) : null,
      averageDeviationSeconds: deviations.length ? Math.round(deviations.reduce((a, b) => a + b, 0) / deviations.length) : null,
      activeBuses: results.filter((x) => ['in_transit', 'approaching_stop', 'at_stop', 'delayed'].includes(x.dto.bus.status)).length,
      routes: routes.map((rt) => {
        const live = results.find((x) => x.bus.routeId === rt.id && x.dto.bus.status !== 'out_of_service');
        const fraction = live?.dto.progressMeters != null && live.dto.routeLengthMeters ? live.dto.progressMeters / live.dto.routeLengthMeters : 0;
        return {
          id: rt.id,
          name: rt.name,
          number: rt.number,
          progressFraction: live?.dto.bus.status === 'completed' ? 1 : Math.min(1, fraction),
          status: live?.dto.bus.status ?? 'none',
          deviationSeconds: live?.dto.deviationSeconds ?? null,
        };
      }),
    };
    res.json(body);
  });

  r.get('/admin/schools', async (req, res) => {
    const where = await scoped(req);
    const schools = await prisma.school.findMany({
      where: where.schoolId ? { id: where.schoolId } : {},
      include: { _count: { select: { routes: true, buses: true, stops: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(schools.map((s) => ({ id: s.id, name: s.name, address: s.address, timeZone: s.timeZone, lat: s.lat, lng: s.lng, isDemo: s.isDemo, counts: s._count })));
  });

  r.post('/admin/schools', async (req, res) => {
    const user = actor(req);
    if (user.schoolId) throw forbidden('Only district-wide administrators can add schools.');
    const body = parse(schoolInputSchema, req.body);
    validateTimeZone(body.timeZone);
    const school = await prisma.school.create({ data: body });
    await audit(prisma, user.id, 'school.create', `Added school ${school.name}`);
    res.status(201).json(school);
  });

  r.put('/admin/schools/:id', async (req, res) => {
    const id = idOf(req);
    assertAdminCanManage(actor(req), id);
    const body = parse(schoolInputSchema, req.body);
    validateTimeZone(body.timeZone);
    const school = await prisma.school.update({ where: { id }, data: body });
    await ctx.catalogChanged();
    await audit(prisma, actor(req).id, 'school.update', `Updated school ${school.name}`);
    res.json(school);
  });

  r.delete('/admin/schools/:id', async (req, res) => {
    const id = idOf(req);
    const user = actor(req);
    if (user.schoolId) throw forbidden('Only district-wide administrators can remove schools.');
    if (id === DEMO_SCHOOL_ID) throw conflict('The demo school cannot be deleted. Use "Reset demo" instead.');
    const counts = await prisma.school.findUnique({ where: { id }, include: { _count: { select: { routes: true, buses: true, studentProfiles: true } } } });
    if (!counts) throw notFound('School');
    if (counts._count.routes || counts._count.buses || counts._count.studentProfiles) {
      throw conflict('Remove this school’s routes, buses and students before deleting it.');
    }
    await prisma.school.delete({ where: { id } });
    await audit(prisma, user.id, 'school.delete', `Removed school ${counts.name}`);
    res.status(204).end();
  });

  r.get('/admin/stops', async (req, res) => {
    const stops = await prisma.stop.findMany({ where: await scoped(req), include: stopInclude, orderBy: { name: 'asc' } });
    res.json(stops.map((s) => toStopDto(s, undefined)));
  });

  r.post('/admin/stops', async (req, res) => {
    const body = parse(stopInputSchema, req.body);
    assertAdminCanManage(actor(req), body.schoolId);
    const stop = await prisma.stop.create({ data: body, include: stopInclude });
    await audit(prisma, actor(req).id, 'stop.create', `Added stop ${stop.name}`);
    res.status(201).json(toStopDto(stop, undefined));
  });

  r.put('/admin/stops/:id', async (req, res) => {
    const id = idOf(req);
    const existing = await prisma.stop.findUnique({ where: { id } });
    if (!existing) throw notFound('Stop');
    assertAdminCanManage(actor(req), existing.schoolId);
    const body = parse(stopInputSchema, req.body);
    assertAdminCanManage(actor(req), body.schoolId);
    const stop = await prisma.stop.update({ where: { id }, data: body, include: stopInclude });
    await ctx.catalogChanged();
    await audit(prisma, actor(req).id, 'stop.update', `Updated stop ${stop.name}`);
    res.json(toStopDto(stop, undefined));
  });

  r.delete('/admin/stops/:id', async (req, res) => {
    const id = idOf(req);
    const existing = await prisma.stop.findUnique({ where: { id }, include: { _count: { select: { routes: true } } } });
    if (!existing) throw notFound('Stop');
    assertAdminCanManage(actor(req), existing.schoolId);
    await prisma.stop.delete({ where: { id } });
    await ctx.catalogChanged();
    await audit(prisma, actor(req).id, 'stop.delete', `Removed stop ${existing.name} (was on ${existing._count.routes} route(s))`);
    res.status(204).end();
  });

  r.get('/admin/routes', async (req, res) => {
    const scope = await scopeOf(req);
    const routes = [...(await ctx.routes.all()).values()]
      .filter((rt) => inScope(scope, rt.schoolId))
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    res.json(await buildRouteSummaries(ctx, routes));
  });

  r.get('/admin/routes/:id', async (req, res) => {
    const route = await ctx.routes.get(idOf(req));
    if (!route || !inScope(await scopeOf(req), route.schoolId)) throw notFound('Route');
    res.json(await buildRouteDetail(ctx, route));
  });

  r.post('/admin/routes', async (req, res) => {
    const body = parse(routeInputSchema, req.body);
    assertAdminCanManage(actor(req), body.schoolId);
    const route = await prisma.route.create({ data: { ...body, geometry: body.geometry ?? undefined } });
    await ctx.catalogChanged();
    await audit(prisma, actor(req).id, 'route.create', `Created Route ${route.number} – ${route.name}`);
    res.status(201).json(await buildRouteDetail(ctx, (await ctx.routes.get(route.id))!));
  });

  r.put('/admin/routes/:id', async (req, res) => {
    const id = idOf(req);
    const existing = await prisma.route.findUnique({ where: { id } });
    if (!existing) throw notFound('Route');
    assertAdminCanManage(actor(req), existing.schoolId);
    const body = parse(routeInputSchema, req.body);
    assertAdminCanManage(actor(req), body.schoolId);
    const { geometry, ...rest } = body;
    const route = await prisma.route.update({
      where: { id },
      data: { ...rest, ...(geometry === undefined ? {} : { geometry: geometry === null ? Prisma.DbNull : geometry }) },
    });
    await ctx.catalogChanged();
    await audit(prisma, actor(req).id, 'route.update', `Updated Route ${route.number} – ${route.name}`);
    res.json(await buildRouteDetail(ctx, (await ctx.routes.get(route.id))!));
  });

  r.put('/admin/routes/:id/stops', async (req, res) => {
    const id = idOf(req);
    const route = await prisma.route.findUnique({ where: { id } });
    if (!route) throw notFound('Route');
    assertAdminCanManage(actor(req), route.schoolId);
    const body = parse(routeStopsInputSchema, req.body);
    const stops = await prisma.stop.findMany({ where: { id: { in: body.stops.map((s) => s.stopId) } }, select: { id: true, schoolId: true } });
    if (stops.length !== body.stops.length || stops.some((s) => s.schoolId !== route.schoolId)) throw badRequest('Every stop must exist and belong to the route’s school.');
    for (let i = 1; i < body.stops.length; i++) {
      if (body.stops[i]!.scheduledArrivalTime < body.stops[i - 1]!.scheduledDepartureTime) throw badRequest(`Stop ${i + 1} is scheduled before the previous stop departs.`);
    }
    await prisma.$transaction([
      prisma.routeStop.deleteMany({ where: { routeId: id } }),
      prisma.routeStop.createMany({ data: body.stops.map((s, i) => ({ routeId: id, stopOrder: i + 1, ...s })) }),
      ...(body.regenerateGeometry ? [prisma.route.update({ where: { id }, data: { geometry: Prisma.DbNull } })] : []),
    ]);
    await ctx.catalogChanged();
    await audit(prisma, actor(req).id, 'route.stops', `Updated stops on Route ${route.number} (${body.stops.length} stops)`);
    res.json(await buildRouteDetail(ctx, (await ctx.routes.get(id))!));
  });

  r.delete('/admin/routes/:id', async (req, res) => {
    const id = idOf(req);
    const route = await prisma.route.findUnique({ where: { id } });
    if (!route) throw notFound('Route');
    assertAdminCanManage(actor(req), route.schoolId);
    await prisma.route.delete({ where: { id } });
    await ctx.catalogChanged();
    await audit(prisma, actor(req).id, 'route.delete', `Deleted Route ${route.number} – ${route.name}`);
    res.status(204).end();
  });

  r.get('/admin/buses', async (req, res) => {
    const scope = await scopeOf(req);
    res.json([...(await ctx.live.buses()).values()].filter((b) => inScope(scope, b.schoolId)).map((b) => toBusDto(b)));
  });

  async function validateBus(req: Request, body: ReturnType<typeof busInputSchema.parse>) {
    assertAdminCanManage(actor(req), body.schoolId);
    if (body.routeId) {
      const route = await prisma.route.findUnique({ where: { id: body.routeId }, select: { schoolId: true } });
      if (!route || route.schoolId !== body.schoolId) throw badRequest('The route must belong to the same school as the bus.');
    }
  }

  async function ensureSimulationState(busId: string, dataSource: string) {
    if (dataSource !== 'demo_simulation') return;
    await prisma.simulationState.upsert({ where: { busId }, create: { busId, ...SIM_DEFAULTS, waitRemainingSeconds: SIM_DEFAULTS.startDelaySeconds }, update: {} });
  }

  r.post('/admin/buses', async (req, res) => {
    const body = parse(busInputSchema, req.body);
    await validateBus(req, body);
    const bus = await prisma.bus.create({ data: body });
    await ensureSimulationState(bus.id, bus.dataSource);
    await ctx.catalogChanged();
    await audit(prisma, actor(req).id, 'bus.create', `Added bus ${bus.busNumber}`);
    res.status(201).json(toBusDto((await ctx.live.bus(bus.id))!));
  });

  r.put('/admin/buses/:id', async (req, res) => {
    const id = idOf(req);
    const existing = await prisma.bus.findUnique({ where: { id } });
    if (!existing) throw notFound('Bus');
    assertAdminCanManage(actor(req), existing.schoolId);
    const body = parse(busInputSchema, req.body);
    await validateBus(req, body);
    const bus = await prisma.bus.update({ where: { id }, data: body });
    await ensureSimulationState(bus.id, bus.dataSource);
    await ctx.catalogChanged();
    const changes = [existing.routeId !== bus.routeId ? 'route assignment' : null, existing.status !== bus.status ? `status → ${bus.status}` : null].filter(Boolean);
    await audit(prisma, actor(req).id, 'bus.update', `Updated bus ${bus.busNumber}${changes.length ? ` (${changes.join(', ')})` : ''}`);
    res.json(toBusDto((await ctx.live.bus(bus.id))!));
  });

  r.delete('/admin/buses/:id', async (req, res) => {
    const id = idOf(req);
    const existing = await prisma.bus.findUnique({ where: { id } });
    if (!existing) throw notFound('Bus');
    assertAdminCanManage(actor(req), existing.schoolId);
    await prisma.bus.delete({ where: { id } });
    await ctx.catalogChanged();
    await audit(prisma, actor(req).id, 'bus.delete', `Removed bus ${existing.busNumber}`);
    res.status(204).end();
  });

  r.post('/admin/buses/:id/manual-location', async (req, res) => {
    const id = idOf(req);
    const bus = await prisma.bus.findUnique({ where: { id } });
    if (!bus) throw notFound('Bus');
    assertAdminCanManage(actor(req), bus.schoolId);
    if (bus.dataSource !== 'manual_test') throw conflict('Set this bus’s data source to "Manual test data" before entering locations.');
    const body = parse(manualLocationSchema, req.body);
    await ctx.providers.manual.record([
      { busId: id, lat: body.lat, lng: body.lng, heading: body.heading, speedMps: body.speedMps, recordedAt: new Date(Date.now() - body.ageSeconds * 1000) },
    ]);
    await audit(prisma, actor(req).id, 'bus.manual_location', `Recorded a manual test location for bus ${bus.busNumber}`);
    res.status(201).json((await ctx.live.compute((await ctx.live.bus(id))!)).dto);
  });

  r.get('/admin/announcements', async (req, res) => {
    const scope = await scopeOf(req);
    res.json(await ctx.announcements.listAll(scope.all ? 'all' : scope.ids));
  });

  async function validateAnnouncementRoutes(schoolId: string, routeIds: string[]) {
    if (!routeIds.length) return;
    const n = await prisma.route.count({ where: { id: { in: routeIds }, schoolId } });
    if (n !== routeIds.length) throw badRequest('Every affected route must belong to the selected school.');
  }

  r.post('/admin/announcements', async (req, res) => {
    const body = parse(announcementInputSchema, req.body);
    assertAdminCanManage(actor(req), body.schoolId);
    await validateAnnouncementRoutes(body.schoolId, body.routeIds);
    const school = await prisma.school.findUnique({ where: { id: body.schoolId }, select: { isDemo: true } });
    const dto = await ctx.announcements.publish(body, actor(req).id, { isDemo: school?.isDemo });
    await audit(prisma, actor(req).id, 'announcement.publish', `Published “${dto.title}”`);
    res.status(201).json(dto);
  });

  const loadAnnouncement = async (req: Request) => {
    const found = await ctx.announcements.get(idOf(req));
    if (!found) throw notFound('Announcement');
    assertAdminCanManage(actor(req), found.dto.schoolId);
    return found.dto;
  };

  r.put('/admin/announcements/:id', async (req, res) => {
    const existing = await loadAnnouncement(req);
    const body = parse(announcementInputSchema, req.body);
    if (body.schoolId !== existing.schoolId) throw badRequest('An announcement cannot move to another school.');
    await validateAnnouncementRoutes(body.schoolId, body.routeIds);
    const dto = await ctx.announcements.update(existing.id, body);
    await audit(prisma, actor(req).id, 'announcement.update', `Edited “${dto.title}”`);
    res.json(dto);
  });

  r.post('/admin/announcements/:id/expire', async (req, res) => {
    const existing = await loadAnnouncement(req);
    const dto = await ctx.announcements.expire(existing.id);
    await audit(prisma, actor(req).id, 'announcement.expire', `Expired “${dto.title}”`);
    res.json(dto);
  });

  r.delete('/admin/announcements/:id', async (req, res) => {
    const existing = await loadAnnouncement(req);
    await prisma.serviceAnnouncement.delete({ where: { id: existing.id } });
    await audit(prisma, actor(req).id, 'announcement.delete', `Deleted “${existing.title}”`);
    res.status(204).end();
  });

  const simStatus = async () => {
    const status = ctx.providers.simulation.status();
    const buses = await ctx.live.buses();
    return {
      ...status,
      buses: status.buses.map((b) => {
        const rec = buses.get(b.busId);
        return { ...b, routeName: rec?.routeName ? `Route ${rec.routeNumber} – ${rec.routeName}` : null, status: rec?.status ?? b.status };
      }),
    };
  };

  const requireSimulation = () => {
    if (!ctx.env.SIMULATION_ENABLED) throw new HttpError(409, 'simulation_disabled', 'The demo simulation is disabled (SIMULATION_ENABLED=false).');
  };

  r.get('/admin/simulation', async (_req, res) => {
    res.json(await simStatus());
  });

  for (const action of ['start', 'resume', 'pause', 'reset'] as const) {
    r.post(`/admin/simulation/${action}`, async (req, res) => {
      requireSimulation();
      const sim = ctx.providers.simulation;
      if (action === 'pause') await sim.pause();
      else if (action === 'reset') {
        await sim.reset();
        ctx.reminders.tracker.clear();
        await ctx.live.syncStatuses();
      } else await sim.resume();
      await audit(prisma, actor(req).id, `simulation.${action}`, `Demo simulation ${action === 'reset' ? 'reset to its starting state' : action === 'pause' ? 'paused' : 'running'}`);
      res.json(await simStatus());
    });
  }

  r.put('/admin/simulation/speed', async (req, res) => {
    requireSimulation();
    const { speedMultiplier } = parse(simulationSpeedSchema, req.body);
    await ctx.providers.simulation.setSpeed(speedMultiplier);
    await audit(prisma, actor(req).id, 'simulation.speed', `Simulation speed set to ${speedMultiplier}×`);
    res.json(await simStatus());
  });

  r.post('/admin/simulation/sample-delay', async (req, res) => {
    assertAdminCanManage(actor(req), DEMO_SCHOOL_ID);
    const routeId = 'demo-route-3';
    if (!(await prisma.route.findUnique({ where: { id: routeId } }))) throw notFound('Demo route');
    const dto = await ctx.announcements.publish(
      {
        schoolId: DEMO_SCHOOL_ID,
        routeIds: [routeId],
        title: '[DEMO] Route 3 running late',
        body: 'Sample delay announcement for the fictional demo district: Bus 23 on Route 3 is running about 7 minutes late due to simulated traffic. This is not a real service alert.',
        severity: 'warning',
        category: 'delay',
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        notifyUsers: true,
      },
      actor(req).id,
      { isDemo: true },
    );
    await audit(prisma, actor(req).id, 'simulation.sample_delay', 'Published a sample delay announcement for Route 3 (demo)');
    res.status(201).json(dto);
  });

  r.get('/admin/parent-links', async (req, res) => {
    const scope = await scopeOf(req);
    const links = await prisma.parentStudentRelationship.findMany({
      where: { student: { isDemo: false, ...(scope.all ? {} : { studentProfile: { schoolId: { in: scope.ids } } }) } },
      include: { parent: { select: { name: true, email: true } }, student: { select: { name: true, studentProfile: { select: { school: { select: { name: true } } } } } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    const body: AdminParentLinkDto[] = links.map((l) => ({
      id: l.id,
      status: l.status,
      parentName: l.parent.name,
      parentEmail: l.parent.email,
      studentName: l.student.name,
      schoolName: l.student.studentProfile?.school.name ?? '',
      createdAt: l.createdAt.toISOString(),
    }));
    res.json(body);
  });

  for (const decision of ['verify', 'reject'] as const) {
    r.post(`/admin/parent-links/:id/${decision}`, async (req, res) => {
      const id = idOf(req);
      const link = await prisma.parentStudentRelationship.findUnique({ where: { id }, include: { student: { select: { studentProfile: { select: { schoolId: true } } } } } });
      if (!link) throw notFound('Link');
      const schoolId = link.student.studentProfile?.schoolId;
      if (!schoolId) throw badRequest('The student has no school on file.');
      assertAdminCanManage(actor(req), schoolId);
      const updated = await prisma.parentStudentRelationship.update({
        where: { id },
        data: decision === 'verify' ? { status: 'verified', verifiedAt: new Date(), verifiedById: actor(req).id } : { status: 'rejected', verifiedAt: null, verifiedById: actor(req).id },
      });
      await audit(prisma, actor(req).id, `parent_link.${decision}`, `${decision === 'verify' ? 'Verified' : 'Rejected'} a parent–student link`);
      res.json({ id: updated.id, status: updated.status });
    });
  }

  return r;
}

function validateTimeZone(tz: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw badRequest('Enter a valid IANA time zone, such as America/Chicago.');
  }
}
