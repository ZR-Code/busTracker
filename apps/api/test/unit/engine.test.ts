import { describe, expect, it } from 'vitest';
import { makeSimRoute, scheduleSecondsAt, SimulationEngine, type SimBusConfig } from '../../src/simulation/engine';

const route = makeSimRoute(
  'r1',
  [
    [41, -88],
    [41, -87.985],
    [41, -87.97],
  ],
  [
    { stopId: 'a', distanceAlongMeters: 0, scheduleOffsetSeconds: 0 },
    { stopId: 'b', distanceAlongMeters: 1250, scheduleOffsetSeconds: 180 },
    { stopId: 'c', distanceAlongMeters: 2517, scheduleOffsetSeconds: 360 },
  ],
);
const config = (over: Partial<SimBusConfig> = {}): SimBusConfig => ({
  busId: 'bus',
  routeId: 'r1',
  cruiseSpeedMps: 10,
  speedFactor: 1,
  initialProgressMeters: 100,
  initialPhase: 'moving',
  initialDelaySeconds: 0,
  startDelaySeconds: 0,
  autoRestart: false,
  ...over,
});
const engine = (cfgs: SimBusConfig[] = [config()]) => {
  const e = new SimulationEngine({ dwellSeconds: 20, restartDelaySeconds: 30 });
  e.load([route], cfgs);
  return e;
};

describe('simulation engine', () => {
  it('advances along the route without jumping', () => {
    const e = engine();
    let last = e.getState('bus')!.progressMeters;
    for (let i = 0; i < 60; i++) {
      e.step(1);
      const p = e.getState('bus')!.progressMeters;
      expect(p).toBeGreaterThanOrEqual(last);
      expect(p - last).toBeLessThanOrEqual(15);
      last = p;
    }
    expect(last).toBeGreaterThan(300);
  });

  it('is deterministic for the same inputs', () => {
    const a = engine();
    const b = engine();
    for (let i = 0; i < 100; i++) {
      a.step(1);
      b.step(1);
    }
    expect(a.getState('bus')).toEqual(b.getState('bus'));
    const c = engine();
    c.step(100);
    expect(c.getState('bus')!.progressMeters).toBeCloseTo(a.getState('bus')!.progressMeters, 6);
  });

  it('stops and dwells at each stop, then moves on', () => {
    const e = engine();
    const events = [];
    for (let i = 0; i < 400; i++) events.push(...e.step(1));
    const types = events.map((ev) => `${ev.type}:${'stopId' in ev ? ev.stopId : ''}`);
    expect(types).toContain('arrived:b');
    expect(types).toContain('departed:b');
    expect(types.indexOf('departed:b')).toBeGreaterThan(types.indexOf('arrived:b'));
  });

  it('completes the route and stays completed without auto-restart', () => {
    const e = engine();
    e.step(1000);
    const s = e.getState('bus')!;
    expect(s.phase).toBe('completed');
    expect(s.progressMeters).toBeCloseTo(route.stops[2]!.distanceAlongMeters, 3);
    e.step(500);
    expect(e.getState('bus')!.phase).toBe('completed');
  });

  it('starts a new trip after completion when auto-restart is on', () => {
    const e = engine([config({ autoRestart: true })]);
    while (e.getState('bus')!.phase !== 'completed') e.step(1);
    expect(e.getState('bus')!.tripNumber).toBe(1);
    e.step(31);
    const s = e.getState('bus')!;
    expect(s.tripNumber).toBe(2);
    expect(s.phase).not.toBe('completed');
  });

  it('waits for its departure time when scheduled', () => {
    const e = engine([config({ initialPhase: 'waiting', initialProgressMeters: 0, startDelaySeconds: 60 })]);
    e.step(59);
    expect(e.getState('bus')!.phase).toBe('waiting');
    e.step(2);
    expect(['moving', 'dwelling']).toContain(e.getState('bus')!.phase);
  });

  it('runs multiple buses independently', () => {
    const e = engine([config({ busId: 'x' }), config({ busId: 'y', speedFactor: 0.5 })]);
    e.step(60);
    expect(e.getState('x')!.progressMeters).toBeGreaterThan(e.getState('y')!.progressMeters);
  });

  it('anchors the timetable so an initially delayed bus starts behind schedule', () => {
    const e = engine([config({ initialDelaySeconds: 300, initialProgressMeters: 625 })]);
    const s = e.getState('bus')!;
    expect(e.simClockSeconds - s.tripScheduledStartSec - scheduleSecondsAt(route, s.progressMeters)).toBeCloseTo(300, 6);
  });

  it('reset restores the deterministic starting state', () => {
    const e = engine();
    const start = { ...e.getState('bus')! };
    e.step(200);
    e.reset();
    expect(e.getState('bus')).toEqual(start);
  });
});
