import { buildRoutePath, makeSimRoute, minutesFromTimeOfDay, type LatLngTuple, type LiveBusRecord, type LiveRoute, type LiveRouteStop, type SchoolDto, type SimBusConfig, type SimRoute } from '@busbuddy/shared';
import { DEMO_BUSES, DEMO_ROUTES, DEMO_SCHOOL, DEMO_SCHOOL_STOP, demoRouteSchedule, demoSimulationConfig, type DemoStop } from '@busbuddy/shared/demo';

export interface WorldRouteStop extends LiveRouteStop {
  description: string;
  lat: number;
  lng: number;
  scheduledDepartureTime: string;
}

export interface WorldRoute extends LiveRoute {
  id: string;
  name: string;
  number: string;
  schoolId: string;
  color: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  geometry: LatLngTuple[];
  stops: WorldRouteStop[];
}

export interface WorldStop extends DemoStop {
  schoolId: string;
  routeIds: string[];
}

export interface WorldBus extends LiveBusRecord {
  lastKnown?: { lat: number; lng: number; ageSeconds: number };
}

export interface World {
  school: SchoolDto;
  routes: Map<string, WorldRoute>;
  stops: Map<string, WorldStop>;
  buses: WorldBus[];
  simRoutes: SimRoute[];
  simConfigs: SimBusConfig[];
}

export function buildWorld(): World {
  const school: SchoolDto = { ...DEMO_SCHOOL, isDemo: true };
  const routes = new Map<string, WorldRoute>();
  const simRoutes: SimRoute[] = [];
  const distancesByRoute = new Map<string, number[]>();

  for (const r of DEMO_ROUTES) {
    const { distances, arrivalTimes, endTime } = demoRouteSchedule(r);
    distancesByRoute.set(r.id, distances);
    const startMin = minutesFromTimeOfDay(r.scheduledStartTime);
    const stops: WorldRouteStop[] = r.stops.map((s, i) => ({
      stopId: s.id,
      name: s.name,
      description: s.description,
      lat: s.lat,
      lng: s.lng,
      order: i + 1,
      scheduledArrivalTime: arrivalTimes[i]!,
      scheduledDepartureTime: arrivalTimes[i]!,
      distanceAlongMeters: distances[i] ?? 0,
      scheduleOffsetSeconds: Math.max(0, (minutesFromTimeOfDay(arrivalTimes[i]!) - startMin) * 60),
    }));
    routes.set(r.id, {
      id: r.id,
      name: r.name,
      number: r.number,
      schoolId: school.id,
      color: r.color,
      scheduledStartTime: r.scheduledStartTime,
      scheduledEndTime: endTime,
      timeZone: school.timeZone,
      active: true,
      geometry: r.geometry,
      geometrySource: 'stored',
      path: buildRoutePath(r.geometry),
      stops,
    });
    simRoutes.push(makeSimRoute(r.id, r.geometry, stops.map((s) => ({ stopId: s.stopId, distanceAlongMeters: s.distanceAlongMeters, scheduleOffsetSeconds: s.scheduleOffsetSeconds }))));
  }

  const stops = new Map<string, WorldStop>();
  for (const s of [DEMO_SCHOOL_STOP, ...DEMO_ROUTES.flatMap((r) => r.stops)]) {
    if (!stops.has(s.id)) stops.set(s.id, { ...s, schoolId: school.id, routeIds: [] });
  }
  for (const r of DEMO_ROUTES) for (const s of r.stops) stops.get(s.id)!.routeIds.push(r.id);

  const buses: WorldBus[] = DEMO_BUSES.map((b) => {
    const route = b.routeId ? routes.get(b.routeId) : undefined;
    return {
      id: b.id,
      busNumber: b.busNumber,
      schoolId: school.id,
      routeId: b.routeId,
      routeName: route?.name ?? null,
      routeNumber: route?.number ?? null,
      status: b.status,
      dataSource: b.dataSource,
      capacity: b.capacity,
      lastKnown: b.lastKnown,
    };
  }).sort((a, b) => a.busNumber.localeCompare(b.busNumber));

  const simConfigs: SimBusConfig[] = DEMO_BUSES.filter((b) => b.simulation && b.routeId).map((b) => {
    const route = DEMO_ROUTES.find((r) => r.id === b.routeId)!;
    return { busId: b.id, routeId: route.id, ...demoSimulationConfig(b, distancesByRoute.get(route.id)!, route.geometry) };
  });

  return { school, routes, stops, buses, simRoutes, simConfigs };
}
