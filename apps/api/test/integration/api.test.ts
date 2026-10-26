import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

const run = Date.now().toString(36).slice(-5).toUpperCase();
import type { BusLiveDto, RouteStopDto } from '@busbuddy/shared';
import { signedInAs, testApp } from '../helpers';

beforeAll(async () => {
  await testApp();
});

describe('buses and routes', () => {
  it('requires authentication for transportation data', async () => {
    const { app } = await testApp();
    const res = await request(app).get('/api/v1/buses/demo-bus-12/live');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it("retrieves a bus's latest location and live ETAs", async () => {
    const { agent } = await signedInAs('student');
    const res = await agent.get('/api/v1/buses/demo-bus-12/live?stopId=demo-stop-r1-4');
    expect(res.status).toBe(200);
    const live = res.body as BusLiveDto;
    expect(live.bus.busNumber).toBe('12');
    expect(live.location?.dataSource).toBe('demo_simulation');
    expect(live.freshness).toBe('simulated');
    expect(live.selectedStopId).toBe('demo-stop-r1-4');
    const stop = live.stops.find((s) => s.stopId === 'demo-stop-r1-4')!;
    expect(stop.etaSeconds).toBeGreaterThan(0);
    expect(JSON.stringify(live)).not.toMatch(/fictional\)|Jordan|Avery/);

    const loc = await agent.get('/api/v1/buses/demo-bus-12/location');
    expect(loc.status).toBe(200);
    expect(loc.body.location.lat).toBeTypeOf('number');
  });

  it('advances the simulation and updates ETAs', async () => {
    const { ctx } = await testApp();
    const { agent } = await signedInAs('student');
    const before = (await agent.get('/api/v1/buses/demo-bus-7/live')).body as BusLiveDto;
    for (let i = 0; i < 10; i++) await ctx.providers.simulation.tick();
    const after = (await agent.get('/api/v1/buses/demo-bus-7/live')).body as BusLiveDto;
    expect(after.progressMeters!).toBeGreaterThan(before.progressMeters!);
  });

  it('reports the seeded range of bus statuses', async () => {
    const { agent } = await signedInAs('student');
    const statuses = Object.fromEntries(
      await Promise.all(['12', '23', '31', '44', '50'].map(async (n) => [n, ((await agent.get(`/api/v1/buses/demo-bus-${n}/live`)).body as BusLiveDto).bus.status])),
    );
    expect(statuses['23']).toBe('delayed');
    expect(statuses['31']).toBe('completed');
    expect(statuses['44']).toBe('out_of_service');
    expect(statuses['50']).toBe('scheduled');
    const stale = (await agent.get('/api/v1/buses/demo-bus-44/live')).body as BusLiveDto;
    expect(stale.freshness).toBe('stale');
  });

  it('retrieves route stops in order', async () => {
    const { agent } = await signedInAs('student');
    const res = await agent.get('/api/v1/routes/demo-route-1/stops');
    expect(res.status).toBe(200);
    const stops = res.body as RouteStopDto[];
    expect(stops).toHaveLength(7);
    expect(stops.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (let i = 1; i < stops.length; i++) expect(stops[i]!.distanceAlongMeters).toBeGreaterThan(stops[i - 1]!.distanceAlongMeters);
  });

  it('returns 400 for invalid parameters and 404 for unknown resources', async () => {
    const { agent } = await signedInAs('student');
    expect((await agent.get('/api/v1/buses/demo-bus-12/history?limit=9999')).status).toBe(400);
    expect((await agent.get('/api/v1/routes/nope')).status).toBe(404);
  });
});

describe('preferences and notifications', () => {
  it('persists favorite stops and reminder preferences', async () => {
    const { agent } = await signedInAs('student');
    const put = await agent.put('/api/v1/stops/demo-stop-r1-3/preference', { favorite: true, reminderLeadMinutes: 10 });
    expect(put.status).toBe(200);
    expect(put.body.favorite).toBe(true);
    const list = await agent.get('/api/v1/stops?routeId=demo-route-1');
    const stop = list.body.find((s: { id: string }) => s.id === 'demo-stop-r1-3');
    expect(stop).toMatchObject({ favorite: true, reminderLeadMinutes: 10 });
    expect((await agent.put('/api/v1/stops/demo-stop-r1-3/preference', { reminderLeadMinutes: 7 })).status).toBe(400);
  });

  it('marks notifications as read, one or all, only for the owner', async () => {
    const { prisma } = await testApp();
    const { user, agent } = await signedInAs('student');
    const other = await signedInAs('student');
    const [a] = await Promise.all([
      prisma.notification.create({ data: { userId: user.id, category: 'general', title: 'A', body: 'a' } }),
      prisma.notification.create({ data: { userId: user.id, category: 'delay', title: 'B', body: 'b' } }),
    ]);
    expect((await agent.get('/api/v1/notifications/unread-count')).body.count).toBe(2);
    expect((await other.agent.post(`/api/v1/notifications/${a!.id}/read`)).status).toBe(404);
    const one = await agent.post(`/api/v1/notifications/${a!.id}/read`);
    expect(one.status).toBe(200);
    expect(one.body.readAt).not.toBeNull();
    expect((await agent.get('/api/v1/notifications/unread-count')).body.count).toBe(1);
    expect((await agent.post('/api/v1/notifications/read-all')).body.updated).toBe(1);
    const filtered = await agent.get('/api/v1/notifications?category=delay');
    expect(filtered.body.items).toHaveLength(1);
  });

  it('fires an arrival reminder once per trip', async () => {
    const { ctx, prisma } = await testApp();
    const { user, agent } = await signedInAs('student');
    await agent.put('/api/v1/stops/demo-stop-r1-3/preference', { reminderLeadMinutes: 10 });
    ctx.reminders.invalidateSubscriptions();
    await ctx.reminders.run();
    await ctx.reminders.run();
    const rows = await prisma.notification.findMany({ where: { userId: user.id, category: 'bus_approaching' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventKey).toMatch(/^arrival:sim-/);
    expect(rows[0]!.isDemo).toBe(true);
  });
});

describe('authorization', () => {
  it('rejects administrator endpoints for students, parents and demo sessions', async () => {
    const { app } = await testApp();
    const student = await signedInAs('student');
    const parent = await signedInAs('parent');
    expect((await student.agent.get('/api/v1/admin/overview')).status).toBe(403);
    expect((await parent.agent.post('/api/v1/admin/simulation/reset')).status).toBe(403);
    expect((await student.agent.post('/api/v1/admin/announcements', { schoolId: 'demo-school-mvhs', title: 'Hack', body: 'nope' })).status).toBe(403);
    const demo = await request(app).post('/api/v1/auth/demo').set('X-BusBuddy-Client', 'web').send({ persona: 'student' });
    expect(demo.status).toBe(201);
    expect(demo.body.role).toBe('student');
    const cookie = demo.headers['set-cookie'] as unknown as string[];
    expect((await request(app).get('/api/v1/admin/buses').set('Cookie', cookie)).status).toBe(403);
  });

  it('requires the CSRF header for state-changing requests', async () => {
    const { app } = await testApp();
    const res = await request(app).post('/api/v1/auth/demo').send({ persona: 'student' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf_check_failed');
  });

  it("prevents one student from reading another student's information", async () => {
    const a = await signedInAs('student');
    const b = await signedInAs('student');
    expect((await a.agent.get(`/api/v1/students/${a.user.id}/transportation`)).status).toBe(200);
    expect((await a.agent.get(`/api/v1/students/${b.user.id}/transportation`)).status).toBe(404);
  });

  it('does not expose student data through an unverified parent link', async () => {
    const { prisma } = await testApp();
    const student = await signedInAs('student', { name: 'Private Student' });
    const parent = await signedInAs('parent');
    const code = (await student.agent.post('/api/v1/me/link-code')).body.code as string;
    const link = await parent.agent.post('/api/v1/me/students/link', { code });
    expect(link.status).toBe(201);
    expect(link.body.status).toBe('pending');

    const list = await parent.agent.get('/api/v1/me/students');
    expect(list.body[0].status).toBe('pending');
    expect(list.body[0].student).toBeNull();
    expect(JSON.stringify(list.body)).not.toContain('Private Student');
    expect((await parent.agent.get(`/api/v1/students/${student.user.id}/transportation`)).status).toBe(404);

    expect((await parent.agent.post('/api/v1/me/students/link', { code })).status).toBe(400);

    await prisma.parentStudentRelationship.update({ where: { id: link.body.relationshipId }, data: { status: 'verified' } });
    const ok = await parent.agent.get(`/api/v1/students/${student.user.id}/transportation`);
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Private Student');
  });

  it('limits school-scoped administrators to their school', async () => {
    const { prisma } = await testApp();
    const other = await prisma.school.create({ data: { name: 'Other School', address: 'x', timeZone: 'America/Chicago', lat: 41, lng: -88 } });
    const admin = await signedInAs('admin', { schoolId: other.id });
    const res = await admin.agent.post('/api/v1/admin/stops', { name: 'X', lat: 41, lng: -88, description: '', schoolId: 'demo-school-mvhs' });
    expect(res.status).toBe(403);
    const overview = await admin.agent.get('/api/v1/admin/overview');
    expect(overview.body.counts.totalBuses).toBe(0);
  });
});

describe('administration', () => {
  it('creates a service announcement and notifies affected users once', async () => {
    const { prisma } = await testApp();
    const admin = await signedInAs('admin', { schoolId: null });
    const rider = await signedInAs('student', { routeId: 'demo-route-2', stopId: 'demo-stop-r2-2' });
    const res = await admin.agent.post('/api/v1/admin/announcements', {
      schoolId: 'demo-school-mvhs',
      routeIds: ['demo-route-2'],
      title: 'Route 2 delayed',
      body: 'Testing announcement delivery.',
      severity: 'warning',
      category: 'delay',
    });
    expect(res.status).toBe(201);
    expect(res.body.active).toBe(true);
    const notes = await prisma.notification.findMany({ where: { userId: rider.user.id, eventKey: `announcement:${res.body.id}` } });
    expect(notes).toHaveLength(1);
    const visible = await rider.agent.get('/api/v1/announcements?routeId=demo-route-2');
    expect(visible.body.some((a: { id: string }) => a.id === res.body.id)).toBe(true);
    const routes = await rider.agent.get('/api/v1/routes');
    expect(routes.body.find((r: { id: string }) => r.id === 'demo-route-2').serviceStatus).toBe('delayed');

    const expired = await admin.agent.post(`/api/v1/admin/announcements/${res.body.id}/expire`);
    expect(expired.body.active).toBe(false);
  });

  it('validates admin input', async () => {
    const admin = await signedInAs('admin', { schoolId: null });
    const res = await admin.agent.post('/api/v1/admin/routes', { name: '', number: '9', schoolId: 'demo-school-mvhs', scheduledStartTime: '7am', scheduledEndTime: '08:00' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('creates a route, adds stops and assigns a bus', async () => {
    const admin = await signedInAs('admin', { schoolId: null });
    const route = await admin.agent.post('/api/v1/admin/routes', { name: 'Test Loop', number: `T${run}`, schoolId: 'demo-school-mvhs', scheduledStartTime: '07:00', scheduledEndTime: '07:30' });
    expect(route.status).toBe(201);
    const stops = await admin.agent.put(`/api/v1/admin/routes/${route.body.id}/stops`, {
      stops: [
        { stopId: 'demo-stop-r1-1', scheduledArrivalTime: '07:00', scheduledDepartureTime: '07:01' },
        { stopId: 'demo-stop-school', scheduledArrivalTime: '07:20', scheduledDepartureTime: '07:20' },
      ],
    });
    expect(stops.status).toBe(200);
    expect(stops.body.geometrySource).toBe('straight_line');
    const bus = await admin.agent.post('/api/v1/admin/buses', { busNumber: `T${run}`, schoolId: 'demo-school-mvhs', routeId: route.body.id });
    expect(bus.status).toBe(201);
    expect(bus.body.routeId).toBe(route.body.id);
  });

  it('controls the demo simulation', async () => {
    const admin = await signedInAs('admin', { schoolId: null });
    expect((await admin.agent.post('/api/v1/admin/simulation/pause')).body.running).toBe(false);
    expect((await admin.agent.put('/api/v1/admin/simulation/speed', { speedMultiplier: 5 })).body.speedMultiplier).toBe(5);
    expect((await admin.agent.put('/api/v1/admin/simulation/speed', { speedMultiplier: 3 })).status).toBe(400);
    const reset = await admin.agent.post('/api/v1/admin/simulation/reset');
    expect(reset.body).toMatchObject({ running: true, speedMultiplier: 1, simClockSeconds: 0 });
  });
});

describe('GPS ingestion', () => {
  it('rejects requests without the API key and accepts valid samples', async () => {
    const { app, prisma, ctx } = await testApp();
    await prisma.bus.create({ data: { id: `gps-bus-${run}`, busNumber: `G${run}`, schoolId: 'demo-school-mvhs', routeId: 'demo-route-2', dataSource: 'district_gps' } });
    ctx.live.invalidate();
    const body = { locations: [{ busNumber: `G${run}`, lat: 41.75, lng: -88.13, recordedAt: new Date().toISOString(), speedMps: 9 }] };
    expect((await request(app).post('/api/v1/ingest/locations').send(body)).status).toBe(401);
    const ok = await request(app).post('/api/v1/ingest/locations').set('X-API-Key', 'test-ingest-key-0123456789abcdef').send(body);
    expect(ok.status).toBe(202);
    expect(ok.body.accepted).toBe(1);
    const { agent } = await signedInAs('student');
    const live = (await agent.get(`/api/v1/buses/gps-bus-${run}/live`)).body as BusLiveDto;
    expect(live.freshness).toBe('live');
    expect(live.location?.dataSource).toBe('district_gps');
  });
});
