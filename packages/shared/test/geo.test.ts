import { describe, expect, it } from 'vitest';
import { bearingDegrees, buildRoutePath, haversineMeters, positionAlong, projectStopsInOrder, type LatLngTuple } from '../src/geo';

const A: LatLngTuple = [41.0, -88.0];
const B: LatLngTuple = [41.0, -87.988];
const C: LatLngTuple = [41.009, -87.988];
const path = buildRoutePath([A, B, C]);

describe('geo', () => {
  it('computes haversine distance', () => {
    expect(haversineMeters([0, 0], [0, 1])).toBeCloseTo(111_195, -2);
  });

  it('builds cumulative distances', () => {
    expect(path.cumulative[0]).toBe(0);
    expect(path.lengthMeters).toBeCloseTo(haversineMeters(A, B) + haversineMeters(B, C), 6);
  });

  it('interpolates between adjacent coordinates (no teleporting)', () => {
    const half = haversineMeters(A, B) / 2;
    const p = positionAlong(path, half);
    expect(p.lat).toBeCloseTo(41.0, 6);
    expect(p.lng).toBeCloseTo(-87.994, 4);
    expect(p.segmentIndex).toBe(0);
  });

  it('heading follows the route geometry', () => {
    expect(positionAlong(path, 10).heading).toBeCloseTo(90, 0);
    expect(positionAlong(path, path.lengthMeters - 10).heading).toBeCloseTo(0, 0);
    expect(bearingDegrees([0, 0], [-1, 0])).toBeCloseTo(180, 5);
  });

  it('clamps positions to the route', () => {
    expect(positionAlong(path, -50).distanceMeters).toBe(0);
    const end = positionAlong(path, path.lengthMeters + 500);
    expect(end.lat).toBeCloseTo(C[0], 6);
  });

  it('projects stops in order, even when a route doubles back', () => {
    const outBack = buildRoutePath([A, B, A]);
    const mid: LatLngTuple = [41.0, -87.994];
    const [first, second] = projectStopsInOrder(outBack, [mid, mid]);
    expect(first).toBeCloseTo(outBack.lengthMeters / 4, -1);
    expect(second).toBeCloseTo((outBack.lengthMeters * 3) / 4, -1);
  });
});
