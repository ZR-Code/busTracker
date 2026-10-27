import type { AnnouncementSeverity, NotificationCategory, SimulationBusPhase } from '../constants';
import { minutesFromTimeOfDay, timeOfDayFromMinutes } from '../format';
import { buildRoutePath, projectStopsInOrder, type LatLngTuple } from '../geo';
import { DEMO_DWELL_SECONDS, type DemoBus, type DemoRoute } from './data';

export const DEMO_PLANNING_SPEED_MPS = 7.8;

export interface DemoRouteSchedule {
  distances: number[];
  arrivalTimes: string[];
  endTime: string;
}

export function demoRouteSchedule(route: DemoRoute): DemoRouteSchedule {
  const path = buildRoutePath(route.geometry);
  const distances = projectStopsInOrder(path, route.stops.map((s) => [s.lat, s.lng] as LatLngTuple));
  const startMin = minutesFromTimeOfDay(route.scheduledStartTime);
  const arrivals = distances.map((d, i) => startMin + Math.round((d / DEMO_PLANNING_SPEED_MPS + DEMO_DWELL_SECONDS * i) / 60));
  return { distances, arrivalTimes: arrivals.map(timeOfDayFromMinutes), endTime: timeOfDayFromMinutes(arrivals[arrivals.length - 1]!) };
}

export function demoSimulationConfig(b: DemoBus, distances: number[], geometry: LatLngTuple[]) {
  const sim = b.simulation!;
  const length = buildRoutePath(geometry).lengthMeters;
  let initialProgressMeters: number;
  let initialPhase: SimulationBusPhase;
  if (sim.startAt === 'route_start') {
    initialProgressMeters = 0;
    initialPhase = sim.startDelaySeconds > 0 ? 'waiting' : 'moving';
  } else if (sim.startAt === 'route_end') {
    initialProgressMeters = length;
    initialPhase = 'completed';
  } else {
    const a = distances[sim.startAt.stopIndex]!;
    const z = distances[sim.startAt.stopIndex + 1] ?? length;
    initialProgressMeters = a + (z - a) * sim.startAt.fraction;
    initialPhase = 'moving';
  }
  return {
    initialProgressMeters,
    initialPhase,
    initialDelaySeconds: sim.initialDelaySeconds,
    startDelaySeconds: sim.startDelaySeconds,
    cruiseSpeedMps: sim.cruiseSpeedMps,
    speedFactor: sim.speedFactor,
    autoRestart: sim.autoRestart,
  };
}

export interface DemoAnnouncement {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  category: NotificationCategory;
  routes: string[];
}

export const DEMO_ANNOUNCEMENTS: DemoAnnouncement[] = [
  {
    id: 'demo-announcement-welcome',
    title: 'Welcome to the Maplewood Valley demo district',
    body: 'Maplewood Valley Unified is a fictional district created to demonstrate BusBuddy. Bus movement in this demo is simulated and does not represent real vehicles.',
    severity: 'info',
    category: 'general',
    routes: [],
  },
  {
    id: 'demo-announcement-detour',
    title: 'Route 3 detour this week (demo)',
    body: 'Sample announcement: construction near Old Mill Junction may add a few minutes to Route 3. Stops are unchanged.',
    severity: 'warning',
    category: 'route_change',
    routes: ['demo-route-3'],
  },
];

export interface DemoStudentSpec {
  name: string;
  routeId: string;
  stopId: string;
}

export interface DemoPersonas {
  student: DemoStudentSpec;
  parent: { name: string; verifiedStudents: [DemoStudentSpec, DemoStudentSpec]; pendingStudent: DemoStudentSpec; favoriteStopIds: string[] };
}

export const DEMO_PERSONAS: DemoPersonas = {
  student: { name: 'Jordan Rivera (demo)', routeId: 'demo-route-1', stopId: 'demo-stop-r1-4' },
  parent: {
    name: 'Casey Rivera (demo parent)',
    verifiedStudents: [
      { name: 'Jordan Rivera (demo)', routeId: 'demo-route-1', stopId: 'demo-stop-r1-4' },
      { name: 'Avery Rivera (demo)', routeId: 'demo-route-3', stopId: 'demo-stop-r3-5' },
    ],
    pendingStudent: { name: 'Sam Okafor (demo)', routeId: 'demo-route-2', stopId: 'demo-stop-r2-4' },
    favoriteStopIds: ['demo-stop-r1-4', 'demo-stop-r3-5'],
  },
};

export const DEMO_REMINDER_LEAD_MINUTES = 5;

export interface DemoSampleNotification {
  category: NotificationCategory;
  title: string;
  body: string;
  routeId?: string;
  eventKey: string;
  read: boolean;
}

export const DEMO_SAMPLE_NOTIFICATIONS: DemoSampleNotification[] = [
  {
    category: 'general',
    title: 'Welcome to the BusBuddy demo',
    body: 'You are exploring a fictional school district. Buses on the map are simulated and labeled DEMO LIVE SIMULATION.',
    eventKey: 'demo:welcome',
    read: false,
  },
  {
    category: 'route_change',
    title: 'Route 3 detour this week (demo)',
    body: 'Sample announcement: construction near Old Mill Junction may add a few minutes to Route 3.',
    routeId: 'demo-route-3',
    eventKey: 'demo:detour',
    read: true,
  },
];
