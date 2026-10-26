export type LatLngTuple = [lat: number, lng: number];

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function haversineMeters(a: LatLngTuple, b: LatLngTuple): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDegrees(a: LatLngTuple, b: LatLngTuple): number {
  const φ1 = toRad(a[0]);
  const φ2 = toRad(b[0]);
  const Δλ = toRad(b[1] - a[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface RoutePath {
  points: LatLngTuple[];
  cumulative: number[];
  lengthMeters: number;
}

export function buildRoutePath(points: LatLngTuple[]): RoutePath {
  if (points.length < 2) throw new Error('A route path needs at least two points');
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1]! + haversineMeters(points[i - 1]!, points[i]!));
  }
  return { points, cumulative, lengthMeters: cumulative[cumulative.length - 1]! };
}

export interface PathPosition {
  lat: number;
  lng: number;
  heading: number;
  segmentIndex: number;
  distanceMeters: number;
}

function segmentAt(path: RoutePath, d: number): number {
  let lo = 0;
  let hi = path.cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.cumulative[mid]! <= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function positionAlong(path: RoutePath, distanceMeters: number): PathPosition {
  const d = Math.max(0, Math.min(path.lengthMeters, distanceMeters));
  let i = segmentAt(path, d);
  while (i < path.points.length - 2 && path.cumulative[i + 1]! - path.cumulative[i]! < 0.01) i++;
  const a = path.points[i]!;
  const b = path.points[i + 1]!;
  const segLen = path.cumulative[i + 1]! - path.cumulative[i]!;
  const t = segLen > 0 ? Math.max(0, Math.min(1, (d - path.cumulative[i]!) / segLen)) : 0;
  return {
    lat: a[0] + (b[0] - a[0]) * t,
    lng: a[1] + (b[1] - a[1]) * t,
    heading: bearingDegrees(a, b),
    segmentIndex: i,
    distanceMeters: d,
  };
}

function projectOntoSegment(p: LatLngTuple, a: LatLngTuple, b: LatLngTuple): { t: number; distanceMeters: number } {
  const kx = Math.cos(toRad(a[0])) * 111_320;
  const ky = 110_540;
  const ax = 0;
  const ay = 0;
  const bx = (b[1] - a[1]) * kx;
  const by = (b[0] - a[0]) * ky;
  const px = (p[1] - a[1]) * kx;
  const py = (p[0] - a[0]) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / len2)) : 0;
  const dx = px - t * bx;
  const dy = py - t * by;
  return { t, distanceMeters: Math.sqrt(dx * dx + dy * dy) };
}

export function projectPoint(path: RoutePath, p: LatLngTuple, fromDistance = 0): { distanceAlong: number; offsetMeters: number } {
  let best = { distanceAlong: fromDistance, offsetMeters: Number.POSITIVE_INFINITY };
  const start = segmentAt(path, Math.max(0, fromDistance));
  for (let i = start; i < path.points.length - 1; i++) {
    const segLen = path.cumulative[i + 1]! - path.cumulative[i]!;
    const proj = projectOntoSegment(p, path.points[i]!, path.points[i + 1]!);
    const along = path.cumulative[i]! + proj.t * segLen;
    if (along < fromDistance) continue;
    if (proj.distanceMeters < best.offsetMeters - 0.01) best = { distanceAlong: along, offsetMeters: proj.distanceMeters };
  }
  return best;
}

export function projectStopsInOrder(path: RoutePath, stops: LatLngTuple[]): number[] {
  const out: number[] = [];
  let from = 0;
  for (const [i, s] of stops.entries()) {
    const { distanceAlong } = projectPoint(path, s, i === 0 ? 0 : Math.min(from + 1, path.lengthMeters));
    out.push(distanceAlong);
    from = distanceAlong;
  }
  return out;
}

export function straightLineGeometry(stops: LatLngTuple[]): LatLngTuple[] {
  return stops.map((s) => [s[0], s[1]]);
}

export function boundsOf(points: LatLngTuple[]): [LatLngTuple, LatLngTuple] | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of points) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
