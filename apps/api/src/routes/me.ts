import { Router } from 'express';
import {
  idParamSchema,
  linkStudentSchema,
  updateProfileSchema,
  updateStudentProfileSchema,
  type DistanceUnits,
  type LinkCodeDto,
  type LinkedStudentDto,
  type MeDto,
  type StudentTransportationDto,
  type ThemePreference,
} from '@busbuddy/shared';
import type { AppContext } from '../context';
import { badRequest, forbidden, notFound, parse, unauthorized } from '../lib/errors';
import { generateLinkCode, sha256 } from '../lib/tokens';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { clearSessionCookie } from '../auth/sessions';
import { canAccessStudent } from '../services/access';
import { buildRouteSummaries } from '../services/catalog';

export async function loadMe(ctx: AppContext, userId: string): Promise<MeDto> {
  const u = await ctx.prisma.user.findUnique({
    where: { id: userId },
    include: {
      settings: true,
      studentProfile: { include: { school: { select: { name: true } }, assignedRoute: { select: { name: true, number: true } }, defaultStop: { select: { name: true } } } },
    },
  });
  if (!u) throw unauthorized();
  const s = u.settings;
  return {
    id: u.id,
    name: u.name,
    email: u.isDemo ? null : u.email,
    role: u.role,
    schoolId: u.studentProfile?.schoolId ?? u.schoolId,
    isDemo: u.isDemo,
    settings: {
      reminderLeadMinutes: s?.reminderLeadMinutes ?? 5,
      remindersEnabled: s?.remindersEnabled ?? true,
      browserNotifications: s?.browserNotifications ?? false,
      distanceUnits: (s?.distanceUnits as DistanceUnits) ?? 'imperial',
      theme: (s?.theme as ThemePreference) ?? 'system',
    },
    studentProfile: u.studentProfile
      ? {
          schoolId: u.studentProfile.schoolId,
          schoolName: u.studentProfile.school.name,
          assignedRouteId: u.studentProfile.assignedRouteId,
          assignedRouteName: u.studentProfile.assignedRoute ? `Route ${u.studentProfile.assignedRoute.number} – ${u.studentProfile.assignedRoute.name}` : null,
          defaultStopId: u.studentProfile.defaultStopId,
          defaultStopName: u.studentProfile.defaultStop?.name ?? null,
        }
      : null,
    permissions: { canSelfAssignRoute: u.role === 'student' && (ctx.env.ALLOW_SELF_ROUTE_ASSIGNMENT || u.isDemo) },
  };
}

async function primaryBusId(ctx: AppContext, routeId: string | null): Promise<string | null> {
  if (!routeId) return null;
  const buses = [...(await ctx.live.buses()).values()].filter((b) => b.routeId === routeId);
  const active = buses.find((b) => b.status !== 'out_of_service') ?? buses[0];
  return active?.id ?? null;
}

export function meRouter(ctx: AppContext): Router {
  const r = Router();
  const { prisma } = ctx;

  r.get('/me', requireAuth, async (req, res) => {
    res.json(await loadMe(ctx, currentUser(req).id));
  });

  r.patch('/me', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const body = parse(updateProfileSchema, req.body);
    if (body.name) await prisma.user.update({ where: { id: user.id }, data: { name: body.name } });
    if (body.settings) {
      await prisma.userSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, ...body.settings }, update: body.settings });
      ctx.reminders.invalidateSubscriptions();
    }
    res.json(await loadMe(ctx, user.id));
  });

  r.delete('/me', requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (user.role === 'admin') throw forbidden('Administrator accounts must be removed by another administrator.');
    await prisma.user.delete({ where: { id: user.id } });
    clearSessionCookie(res, ctx.env.isProduction);
    res.status(204).end();
  });

  r.patch('/me/student-profile', requireRole('student'), async (req, res) => {
    const me = await loadMe(ctx, currentUser(req).id);
    if (!me.permissions.canSelfAssignRoute) throw forbidden('Your school assigns routes. Contact your transportation office to change it.');
    const body = parse(updateStudentProfileSchema, req.body);
    const profile = await prisma.studentProfile.findUnique({ where: { userId: me.id } });
    if (!profile) throw notFound('Student profile');
    const schoolId = body.schoolId ?? profile.schoolId;
    if (body.schoolId && !(await prisma.school.findUnique({ where: { id: body.schoolId } }))) throw badRequest('Choose a valid school.');
    const routeId = body.assignedRouteId === undefined ? (body.schoolId && body.schoolId !== profile.schoolId ? null : profile.assignedRouteId) : body.assignedRouteId;
    if (routeId) {
      const route = await prisma.route.findUnique({ where: { id: routeId }, select: { schoolId: true } });
      if (!route || route.schoolId !== schoolId) throw badRequest('That route does not serve your school.');
    }
    let stopId = body.defaultStopId === undefined ? profile.defaultStopId : body.defaultStopId;
    if (routeId !== profile.assignedRouteId && body.defaultStopId === undefined) stopId = null;
    if (stopId) {
      if (!routeId) throw badRequest('Choose a route before choosing a stop.');
      const onRoute = await prisma.routeStop.findUnique({ where: { routeId_stopId: { routeId, stopId } } });
      if (!onRoute) throw badRequest('That stop is not on your route.');
    }
    await prisma.studentProfile.update({ where: { userId: me.id }, data: { schoolId, assignedRouteId: routeId, defaultStopId: stopId } });
    if (body.schoolId) await prisma.user.update({ where: { id: me.id }, data: { schoolId } });
    res.json(await loadMe(ctx, me.id));
  });

  r.get('/me/stop-preferences', requireAuth, async (req, res) => {
    const prefs = await prisma.userStopPreference.findMany({ where: { userId: currentUser(req).id }, select: { stopId: true, favorite: true, reminderLeadMinutes: true } });
    res.json(prefs);
  });

  r.post('/me/link-code', requireRole('student'), async (req, res) => {
    const user = currentUser(req);
    const code = generateLinkCode();
    const expiresAt = new Date(Date.now() + 24 * 3_600_000);
    await prisma.$transaction([
      prisma.linkCode.deleteMany({ where: { studentId: user.id, usedAt: null } }),
      prisma.linkCode.create({ data: { studentId: user.id, codeHash: sha256(code), expiresAt } }),
    ]);
    const body: LinkCodeDto = { code, expiresAt: expiresAt.toISOString() };
    res.status(201).json(body);
  });

  r.get('/me/students', requireRole('parent'), async (req, res) => {
    const links = await prisma.parentStudentRelationship.findMany({
      where: { parentId: currentUser(req).id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            studentProfile: { include: { school: { select: { name: true } }, assignedRoute: { select: { name: true, number: true } }, defaultStop: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const out: LinkedStudentDto[] = [];
    for (const l of links) {
      const p = l.student.studentProfile;
      out.push({
        relationshipId: l.id,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        student:
          l.status === 'verified'
            ? {
                id: l.student.id,
                name: l.student.name,
                schoolName: p?.school.name ?? '',
                assignedRouteId: p?.assignedRouteId ?? null,
                assignedRouteName: p?.assignedRoute ? `Route ${p.assignedRoute.number} – ${p.assignedRoute.name}` : null,
                defaultStopId: p?.defaultStopId ?? null,
                defaultStopName: p?.defaultStop?.name ?? null,
                busId: await primaryBusId(ctx, p?.assignedRouteId ?? null),
              }
            : null,
      });
    }
    res.json(out);
  });

  r.post('/me/students/link', requireRole('parent'), async (req, res) => {
    const parent = currentUser(req);
    const { code } = parse(linkStudentSchema, req.body);
    const row = await prisma.linkCode.findUnique({ where: { codeHash: sha256(code) } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) throw badRequest('That code is invalid or has expired. Ask your student for a new code.');
    await prisma.linkCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    const link = await prisma.parentStudentRelationship.upsert({
      where: { parentId_studentId: { parentId: parent.id, studentId: row.studentId } },
      create: { parentId: parent.id, studentId: row.studentId, status: 'pending' },
      update: {},
    });
    res.status(201).json({ relationshipId: link.id, status: link.status });
  });

  r.delete('/me/students/:id', requireRole('parent'), async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const res2 = await prisma.parentStudentRelationship.deleteMany({ where: { id, parentId: currentUser(req).id } });
    if (res2.count === 0) throw notFound('Link');
    res.status(204).end();
  });

  r.get('/students/:id/transportation', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const { id } = parse(idParamSchema, req.params);
    if (!(await canAccessStudent(prisma, user, id))) throw notFound('Student');
    const student = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true, studentProfile: { include: { school: { select: { name: true } }, defaultStop: { select: { id: true, name: true } } } } },
    });
    if (!student || student.role !== 'student') throw notFound('Student');
    const p = student.studentProfile;
    const route = p?.assignedRouteId ? await ctx.routes.get(p.assignedRouteId) : undefined;
    const body: StudentTransportationDto = {
      studentId: student.id,
      name: student.name,
      schoolName: p?.school.name ?? '',
      route: route ? ((await buildRouteSummaries(ctx, [route]))[0] ?? null) : null,
      defaultStop: p?.defaultStop ?? null,
      busId: await primaryBusId(ctx, p?.assignedRouteId ?? null),
    };
    res.json(body);
  });

  return r;
}
