import { describe, expect, it } from 'vitest';
import { classifyFreshness, computeEta, effectiveSpeed, type EtaInput } from '../src/eta';

const now = 1_700_000_000_000;
const stops = [
  { stopId: 's1', name: 'One', order: 1, distanceAlongMeters: 0, scheduledAtMs: now - 120_000, dwellSeconds: 20 },
  { stopId: 's2', name: 'Two', order: 2, distanceAlongMeters: 1000, scheduledAtMs: now + 100_000, dwellSeconds: 20 },
  { stopId: 's3', name: 'Three', order: 3, distanceAlongMeters: 2000, scheduledAtMs: now + 220_000, dwellSeconds: 20 },
];
const base = (over: Partial<EtaInput> = {}): EtaInput => ({
  nowMs: now,
  stops,
  hasGeometry: true,
  location: { progressMeters: 500, speedMps: 10, recordedAtMs: now - 2000, dataSource: 'district_gps' },
  busStatus: 'in_transit',
  cruiseSpeedMps: 10,
  timeScale: 1,
  staleAfterSeconds: 90,
  ...over,
});

describe('computeEta', () => {
  it('uses route distance and speed to estimate arrival', () => {
    const r = computeEta(base());
    const s2 = r.stops.find((s) => s.stopId === 's2')!;
    expect(s2.distanceMeters).toBe(500);
    expect(s2.etaSeconds).toBe(50);
    expect(s2.state).toBe('next');
    expect(r.nextStopId).toBe('s2');
    expect(r.stops[0]!.state).toBe('passed');
  });

  it('adds dwell time at intermediate stops', () => {
    const r = computeEta(base());
    const s3 = r.stops.find((s) => s.stopId === 's3')!;
    expect(s3.etaSeconds).toBe(150 + 20);
  });

  it('marks the next stop as approaching inside 400 m', () => {
    const r = computeEta(base({ location: { progressMeters: 700, speedMps: 10, recordedAtMs: now, dataSource: 'district_gps' } }));
    expect(r.stops[1]!.state).toBe('approaching');
  });

  it('updates as the bus moves', () => {
    const a = computeEta(base()).stops[1]!.etaSeconds!;
    const b = computeEta(base({ location: { progressMeters: 800, speedMps: 10, recordedAtMs: now, dataSource: 'district_gps' } })).stops[1]!.etaSeconds!;
    expect(b).toBeLessThan(a);
  });

  it('never divides by a zero speed', () => {
    const r = computeEta(base({ location: { progressMeters: 500, speedMps: 0, recordedAtMs: now, dataSource: 'district_gps' } }));
    expect(r.stops[1]!.etaSeconds).toBe(50);
    expect(effectiveSpeed(0, 10)).toBe(10);
    expect(effectiveSpeed(Number.NaN, 0)).toBe(1);
  });

  it('does not report an ETA of zero when location data is missing', () => {
    const r = computeEta(base({ location: null }));
    expect(r.freshness).toBe('unavailable');
    expect(r.stops.every((s) => s.etaSeconds === null)).toBe(true);
    expect(r.confidence.level).toBe('none');
  });

  it('flags stale data as uncertain and lowers confidence', () => {
    const r = computeEta(base({ location: { progressMeters: 500, speedMps: 10, recordedAtMs: now - 300_000, dataSource: 'district_gps' } }));
    expect(r.freshness).toBe('stale');
    expect(r.uncertain).toBe(true);
    expect(r.confidence.level).not.toBe('high');
  });

  it('distinguishes stopped-at-stop from stopped between stops', () => {
    const atStop = computeEta(base({ location: { progressMeters: 1000, speedMps: 0, recordedAtMs: now, dataSource: 'district_gps' } }));
    expect(atStop.movement).toBe('stopped_at_stop');
    expect(atStop.stops[1]!.state).toBe('at_stop');
    const between = computeEta(base({ location: { progressMeters: 1500, speedMps: 0, recordedAtMs: now, dataSource: 'district_gps' } }));
    expect(between.movement).toBe('stopped');
    expect(between.confidence.reasons.join(' ')).toMatch(/stationary/);
  });

  it('computes schedule adherence', () => {
    expect(computeEta(base()).adherence).toBe('on_time');
    const late = computeEta(base({ stops: stops.map((s) => (s.stopId === 's2' ? { ...s, scheduledAtMs: now - 400_000 } : s)) }));
    expect(late.adherence).toBe('late');
  });

  it('scales countdowns by the simulation speed', () => {
    const r = computeEta(base({ timeScale: 5 }));
    expect(r.stops[1]!.etaSeconds).toBe(10);
  });

  it('treats completed buses as having passed every stop', () => {
    const r = computeEta(base({ busStatus: 'completed' }));
    expect(r.stops.every((s) => s.state === 'passed' && s.etaSeconds === null)).toBe(true);
  });
});

describe('classifyFreshness', () => {
  it('labels sources distinctly', () => {
    expect(classifyFreshness({ recordedAtMs: now, dataSource: 'district_gps' }, now, 90).freshness).toBe('live');
    expect(classifyFreshness({ recordedAtMs: now, dataSource: 'demo_simulation' }, now, 90).freshness).toBe('simulated');
    expect(classifyFreshness({ recordedAtMs: now, dataSource: 'manual_test' }, now, 90).freshness).toBe('manual');
    expect(classifyFreshness({ recordedAtMs: now - 91_000, dataSource: 'demo_simulation' }, now, 90).freshness).toBe('stale');
    expect(classifyFreshness(null, now, 90).freshness).toBe('unavailable');
  });
});
