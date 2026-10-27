import type { BusLiveDto, LinkedStudentDto, MeDto, NotificationDto, Paginated } from '@busbuddy/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocalBackend, usingLocalBackend } from '@/lib/api';
import { BrowserBackend } from './backend';
import { loadAuthConfig } from './connect';

let clock = Date.UTC(2026, 9, 26, 12, 0, 0);
const now = () => clock;

async function call<T>(b: BrowserBackend, method: string, path: string, body?: unknown) {
  const res = await b.handle(method, path, body);
  return { status: res.status, body: res.body as T };
}

async function tick(b: BrowserBackend, seconds: number) {
  for (let i = 0; i < seconds; i += 3) {
    clock += 3000;
    await call(b, 'GET', '/notifications/unread-count');
  }
}

beforeEach(() => {
  localStorage.clear();
  clock = Date.UTC(2026, 9, 26, 12, 0, 0);
});

describe('BrowserBackend', () => {
  it('starts a student demo with simulated buses and a stale out-of-service bus', async () => {
    const b = new BrowserBackend(now);
    expect((await call<{ me: MeDto | null }>(b, 'GET', '/auth/session')).body.me).toBeNull();
    expect((await call(b, 'GET', '/buses/live')).status).toBe(401);

    const demo = await call<MeDto>(b, 'POST', '/auth/demo', { persona: 'student' });
    expect(demo.status).toBe(201);
    expect(demo.body.role).toBe('student');
    expect(demo.body.isDemo).toBe(true);
    expect(demo.body.studentProfile?.defaultStopName).toBe('Copper Kettle Park');

    const live = (await call<BusLiveDto[]>(b, 'GET', '/buses/live')).body;
    const bus12 = live.find((x) => x.bus.busNumber === '12')!;
    expect(bus12.location?.dataSource).toBe('demo_simulation');
    expect(bus12.freshness).toBe('simulated');
    const bus44 = live.find((x) => x.bus.busNumber === '44')!;
    expect(bus44.bus.status).toBe('out_of_service');
    expect(bus44.freshness).toBe('stale');

    const before = bus12.progressMeters!;
    clock += 10_000;
    const after = (await call<BusLiveDto>(b, 'GET', `/buses/${bus12.bus.id}/live`)).body.progressMeters!;
    expect(after).toBeGreaterThan(before);
  });

  it('fires an arrival reminder once per trip', async () => {
    const b = new BrowserBackend(now);
    await call(b, 'POST', '/auth/demo', { persona: 'student' });
    expect((await call(b, 'PUT', '/stops/demo-stop-r1-4/preference', { reminderLeadMinutes: 10 })).status).toBe(200);

    await tick(b, 600);
    const reminders = async () =>
      (await call<Paginated<NotificationDto>>(b, 'GET', '/notifications?category=bus_approaching&limit=50')).body.items.filter((n) => n.stopId === 'demo-stop-r1-4');
    const first = await reminders();
    expect(first).toHaveLength(1);
    expect(first[0]!.body).toContain('Demo simulation');

    await tick(b, 60);
    expect(await reminders()).toHaveLength(1);
  });

  it('shows parents only verified students', async () => {
    const b = new BrowserBackend(now);
    const otherStudent = (await call<MeDto>(b, 'POST', '/auth/demo', { persona: 'student' })).body;
    await call(b, 'POST', '/auth/demo', { persona: 'parent' });
    const links = (await call<LinkedStudentDto[]>(b, 'GET', '/me/students')).body;
    expect(links.map((l) => l.status)).toEqual(['verified', 'verified', 'pending']);
    expect(links[2]!.student).toBeNull();

    const verified = links[0]!.student!;
    expect((await call(b, 'GET', `/students/${verified.id}/transportation`)).status).toBe(200);
    expect((await call(b, 'GET', `/students/${otherStudent.id}/transportation`)).status).toBe(404);
  });

  it('refuses admin and account endpoints', async () => {
    const b = new BrowserBackend(now);
    await call(b, 'POST', '/auth/demo', { persona: 'student' });
    expect((await call(b, 'GET', '/admin/overview')).status).toBe(403);
    const login = await call<{ error: { code: string } }>(b, 'POST', '/auth/login', { email: 'a@b.co', password: 'x' });
    expect(login.status).toBe(503);
    expect(login.body.error.code).toBe('server_required');
  });

  it('keeps the session across reloads', async () => {
    const first = new BrowserBackend(now);
    const me = (await call<MeDto>(first, 'POST', '/auth/demo', { persona: 'student' })).body;
    clock += 60_000;
    const second = new BrowserBackend(now);
    expect((await call<{ me: MeDto | null }>(second, 'GET', '/auth/session')).body.me?.id).toBe(me.id);
  });
});

describe('loadAuthConfig', () => {
  afterEach(() => {
    setLocalBackend(null);
    vi.unstubAllGlobals();
  });

  it('uses the server when it answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ provider: 'local', demoEnabled: true, passwordResetDelivery: 'server_log', supabase: null }), { status: 200 })));
    await loadAuthConfig();
    expect(usingLocalBackend()).toBe(false);
  });

  it('falls back to the browser demo when the server is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));
    const cfg = await loadAuthConfig();
    expect(cfg.demoEnabled).toBe(true);
    expect(usingLocalBackend()).toBe(true);
  });

  it('falls back when the host returns its HTML page instead of JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', { status: 200 })));
    await loadAuthConfig();
    expect(usingLocalBackend()).toBe(true);
  });
});
