import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makeSimRoute, SimulationEngine, minutesFromTimeOfDay } from '@busbuddy/shared';
import {
  DEMO_ANNOUNCEMENTS,
  DEMO_BUSES,
  DEMO_DWELL_SECONDS,
  DEMO_PEOPLE,
  DEMO_ROUTES,
  DEMO_SCHOOL,
  DEMO_SCHOOL_ID,
  DEMO_SCHOOL_STOP,
  demoRouteSchedule,
  demoSimulationConfig,
} from '@busbuddy/shared/demo';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

export async function seed(prisma: PrismaClient, opts: { resetSimulation?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log;

  await prisma.school.upsert({
    where: { id: DEMO_SCHOOL_ID },
    create: { ...DEMO_SCHOOL, isDemo: true },
    update: { ...DEMO_SCHOOL, isDemo: true },
  });

  const allStops = [DEMO_SCHOOL_STOP, ...DEMO_ROUTES.flatMap((r) => r.stops.filter((s) => s.id !== DEMO_SCHOOL_STOP.id))];
  for (const s of allStops) {
    const data = { name: s.name, lat: s.lat, lng: s.lng, description: s.description, schoolId: DEMO_SCHOOL_ID, isDemo: true };
    await prisma.stop.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }

  const stopDistances = new Map<string, number[]>();
  for (const r of DEMO_ROUTES) {
    const { distances, arrivalTimes, endTime } = demoRouteSchedule(r);
    stopDistances.set(r.id, distances);
    const data = {
      name: r.name,
      number: r.number,
      schoolId: DEMO_SCHOOL_ID,
      color: r.color,
      geometry: r.geometry,
      active: true,
      scheduledStartTime: r.scheduledStartTime,
      scheduledEndTime: endTime,
      isDemo: true,
    };
    await prisma.route.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
    await prisma.$transaction([
      prisma.routeStop.deleteMany({ where: { routeId: r.id } }),
      prisma.routeStop.createMany({
        data: r.stops.map((s, i) => ({
          routeId: r.id,
          stopId: s.id,
          stopOrder: i + 1,
          scheduledArrivalTime: arrivalTimes[i]!,
          scheduledDepartureTime: arrivalTimes[i]!,
        })),
      }),
    ]);
  }

  for (const b of DEMO_BUSES) {
    const data = { busNumber: b.busNumber, schoolId: DEMO_SCHOOL_ID, routeId: b.routeId, status: b.status, dataSource: b.dataSource, capacity: b.capacity, isDemo: true };
    await prisma.bus.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data });
    if (b.simulation && b.routeId) {
      const cfg = demoSimulationConfig(b, stopDistances.get(b.routeId)!, DEMO_ROUTES.find((r) => r.id === b.routeId)!.geometry);
      const existing = await prisma.simulationState.findUnique({ where: { busId: b.id } });
      const route = DEMO_ROUTES.find((r) => r.id === b.routeId)!;
      const arrivals = await prisma.routeStop.findMany({ where: { routeId: route.id }, orderBy: { stopOrder: 'asc' } });
      const startMin = minutesFromTimeOfDay(route.scheduledStartTime);
      const simRoute = makeSimRoute(
        route.id,
        route.geometry,
        stopDistances.get(route.id)!.map((d, i) => ({
          stopId: route.stops[i]!.id,
          distanceAlongMeters: d,
          scheduleOffsetSeconds: (minutesFromTimeOfDay(arrivals[i]!.scheduledArrivalTime) - startMin) * 60,
        })),
      );
      const engine = new SimulationEngine({ dwellSeconds: DEMO_DWELL_SECONDS, restartDelaySeconds: 0 });
      const initial = engine.initialState({ busId: b.id, routeId: route.id, ...cfg }, simRoute);
      const live = {
        phase: initial.phase,
        progressMeters: initial.progressMeters,
        nextStopIndex: initial.nextStopIndex,
        segmentIndex: initial.segmentIndex,
        speedMps: initial.speedMps,
        dwellRemainingSeconds: 0,
        waitRemainingSeconds: initial.waitRemainingSeconds,
        tripNumber: 1,
        tripScheduledStartSec: initial.tripScheduledStartSec,
      };
      if (!existing) await prisma.simulationState.create({ data: { busId: b.id, ...cfg, ...live } });
      else await prisma.simulationState.update({ where: { busId: b.id }, data: opts.resetSimulation ? { ...cfg, ...live } : cfg });
    }
    if (b.lastKnown) {
      await prisma.busLocation.deleteMany({ where: { busId: b.id } });
      await prisma.busLocation.create({
        data: {
          busId: b.id,
          lat: b.lastKnown.lat,
          lng: b.lastKnown.lng,
          heading: 0,
          speedMps: 0,
          dataSource: b.dataSource,
          recordedAt: new Date(Date.now() - b.lastKnown.ageSeconds * 1000),
        },
      });
    }
  }

  const settings = await prisma.simulationSettings.findUnique({ where: { id: 'global' } });
  if (!settings) await prisma.simulationSettings.create({ data: { id: 'global', running: true, speedMultiplier: 1, simClockSeconds: 0 } });
  else if (opts.resetSimulation) await prisma.simulationSettings.update({ where: { id: 'global' }, data: { running: true, speedMultiplier: 1, simClockSeconds: 0, resetAt: new Date() } });

  const studentAssignments = [
    { route: 'demo-route-1', stop: 'demo-stop-r1-2' },
    { route: 'demo-route-2', stop: 'demo-stop-r2-3' },
    { route: 'demo-route-3', stop: 'demo-stop-r3-4' },
    { route: 'demo-route-4', stop: 'demo-stop-r4-2' },
    { route: 'demo-route-1', stop: 'demo-stop-r1-5' },
  ];
  for (const [i, name] of DEMO_PEOPLE.studentNames.entries()) {
    const id = `demo-student-${i + 1}`;
    const a = studentAssignments[i]!;
    await prisma.user.upsert({
      where: { id },
      create: { id, name: `${name} (fictional)`, role: 'student', schoolId: DEMO_SCHOOL_ID, isDemo: false },
      update: { name: `${name} (fictional)` },
    });
    await prisma.studentProfile.upsert({
      where: { userId: id },
      create: { userId: id, schoolId: DEMO_SCHOOL_ID, assignedRouteId: a.route, defaultStopId: a.stop },
      update: { assignedRouteId: a.route, defaultStopId: a.stop },
    });
    await prisma.userSettings.upsert({ where: { userId: id }, create: { userId: id }, update: {} });
    const welcomeKey = 'seed:welcome';
    await prisma.notification.upsert({
      where: { userId_eventKey: { userId: id, eventKey: welcomeKey } },
      create: {
        userId: id,
        eventKey: welcomeKey,
        category: 'general',
        title: 'Welcome to BusBuddy',
        body: 'This is a fictional demonstration account.',
        isDemo: true,
      },
      update: {},
    });
  }

  for (const a of DEMO_ANNOUNCEMENTS) {
    const data = { schoolId: DEMO_SCHOOL_ID, title: a.title, body: a.body, severity: a.severity, category: a.category, isDemo: true, expiresAt: null };
    await prisma.serviceAnnouncement.upsert({ where: { id: a.id }, create: { id: a.id, ...data }, update: data });
    await prisma.announcementRoute.deleteMany({ where: { announcementId: a.id } });
    if (a.routes.length) await prisma.announcementRoute.createMany({ data: a.routes.map((routeId) => ({ announcementId: a.id, routeId })) });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 10) throw new Error('SEED_ADMIN_PASSWORD must be at least 10 characters');
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const name = process.env.SEED_ADMIN_NAME?.trim() || 'Demo Administrator';
    await prisma.user.upsert({
      where: { email: adminEmail },
      create: { email: adminEmail, name, role: 'admin', schoolId: null, passwordHash, settings: { create: {} } },
      update: { role: 'admin', passwordHash, name },
    });
    log(`[seed] Local administrator ready: ${adminEmail}`);
  } else {
    log('[seed] SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set; no administrator created.');
  }

  log(`[seed] Demo data ready: 1 school, ${DEMO_ROUTES.length} routes, ${allStops.length} stops, ${DEMO_BUSES.length} buses.`);
}


const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const prisma = new PrismaClient();
  seed(prisma, { resetSimulation: process.argv.includes('--reset-simulation') })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
