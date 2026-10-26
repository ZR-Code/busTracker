import type { BusStatus, DataSource } from '../constants';
import type { LatLngTuple } from '../geo';
import geometry from './geometry.json';

export const DEMO_SCHOOL_ID = 'demo-school-mvhs';
export const DEMO_DISTRICT_NAME = 'Maplewood Valley Unified School District (fictional)';

export interface DemoStop {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
}

export interface DemoRoute {
  id: string;
  name: string;
  number: string;
  color: string;
  scheduledStartTime: string;
  geometry: LatLngTuple[];
  stops: DemoStop[];
}

export interface DemoBusSimulation {
  startAt: { stopIndex: number; fraction: number } | 'route_start' | 'route_end';
  cruiseSpeedMps: number;
  speedFactor: number;
  initialDelaySeconds: number;
  startDelaySeconds: number;
  autoRestart: boolean;
}

export interface DemoBus {
  id: string;
  busNumber: string;
  routeId: string | null;
  status: BusStatus;
  dataSource: DataSource;
  capacity: number;
  simulation: DemoBusSimulation | null;
  lastKnown?: { lat: number; lng: number; ageSeconds: number };
}

type GeometryFile = {
  school: { lat: number; lng: number };
  routes: Record<string, { stops: { lat: number; lng: number; street: string }[]; coordinates: LatLngTuple[] }>;
};
const geo = geometry as unknown as GeometryFile;

export const DEMO_SCHOOL = {
  id: DEMO_SCHOOL_ID,
  name: 'Maplewood Valley High School',
  address: 'Fictional campus — Maplewood Valley Unified (demo)',
  timeZone: 'America/Chicago',
  lat: geo.school.lat,
  lng: geo.school.lng,
};

const SCHOOL_STOP_NAME = 'Maplewood Valley HS — Bus Loop';

function describe(street: string, extra: string): string {
  return street ? `${extra} on ${street}` : extra;
}

const routeMeta: { key: string; name: string; number: string; color: string; start: string; stopNames: [string, string][] }[] = [
  {
    key: 'R1',
    name: 'North Maple',
    number: '1',
    color: '#2878E5',
    start: '07:00',
    stopNames: [
      ['Juniper Bend', 'Corner pickup near the mailbox cluster'],
      ['Foxglove Commons', 'In front of the community green'],
      ['Larkspur & Sequoia', 'Northeast corner, by the crosswalk'],
      ['Copper Kettle Park', 'Park entrance, next to the bench'],
      ['Sequoia Ridge', 'Across from the playground'],
      ['Riverbank Crossing', 'Shelter near the bike rack'],
    ],
  },
  {
    key: 'R2',
    name: 'East Meadow',
    number: '2',
    color: '#7C3AED',
    start: '07:05',
    stopNames: [
      ['Hobson Hollow', 'Corner pickup by the stop sign'],
      ['Meadowlark Plaza', 'Curbside across from the plaza'],
      ['Meander Way', 'Mid-block, near the hydrant'],
      ['Thistle Court', 'Cul-de-sac entrance'],
      ['Buckeye Green', 'Next to the green space'],
      ['Vermont Commons', 'Corner pickup near the streetlight'],
    ],
  },
  {
    key: 'R3',
    name: 'South Prairie',
    number: '3',
    color: '#DB2777',
    start: '07:00',
    stopNames: [
      ['Country View Loop', 'Corner pickup by the trail head'],
      ['Prairie Lantern', 'Curbside near the pond'],
      ['Dorval Crossing', 'At the crosswalk'],
      ['Old Mill Junction', 'Shelter at the intersection'],
      ['Wildflower Lane', 'Mid-block pickup'],
      ['Sheringham Square', 'Corner pickup near the square'],
    ],
  },
  {
    key: 'R4',
    name: 'West Creek',
    number: '4',
    color: '#0D9488',
    start: '07:10',
    stopNames: [
      ['Creekside Terrace', 'Corner pickup'],
      ['Dunraven Point', 'Curbside by the stop sign'],
      ['Willow Run', 'In front of the walking path'],
      ['Book Road Shelter', 'Shelter at the intersection'],
      ['Aspen Grove', 'Corner pickup by the hydrant'],
      ['Cardinal Way', 'Curbside near the school zone sign'],
    ],
  },
  {
    key: 'R5',
    name: 'Lakeside Early Run',
    number: '5',
    color: '#EA580C',
    start: '06:35',
    stopNames: [
      ['Sleight Street Station', 'Corner pickup'],
      ['Hillside Overlook', 'Curbside near the overlook'],
      ['Pam Davis Drive', 'At the crosswalk'],
      ['Hazelwood Circle', 'Cul-de-sac entrance'],
      ['Antietam Court', 'Corner pickup'],
    ],
  },
];

export const DEMO_SCHOOL_STOP: DemoStop = {
  id: 'demo-stop-school',
  name: SCHOOL_STOP_NAME,
  description: 'School bus loop (destination)',
  lat: geo.school.lat,
  lng: geo.school.lng,
};

export const DEMO_ROUTES: DemoRoute[] = routeMeta.map((m, ri) => {
  const g = geo.routes[m.key];
  if (!g) throw new Error(`Missing geometry for ${m.key}`);
  return {
    id: `demo-route-${ri + 1}`,
    name: m.name,
    number: m.number,
    color: m.color,
    scheduledStartTime: m.start,
    geometry: g.coordinates,
    stops: [
      ...g.stops.map((s, si) => {
        const meta = m.stopNames[si];
        if (!meta) throw new Error(`Missing stop name for ${m.key} #${si}`);
        return { id: `demo-stop-r${ri + 1}-${si + 1}`, name: meta[0], description: describe(s.street, meta[1]), lat: s.lat, lng: s.lng };
      }),
      DEMO_SCHOOL_STOP,
    ],
  };
});

const DEPOT: LatLngTuple = [41.7465, -88.1598];

export const DEMO_BUSES: DemoBus[] = [
  {
    id: 'demo-bus-12',
    busNumber: '12',
    routeId: 'demo-route-1',
    status: 'approaching_stop',
    dataSource: 'demo_simulation',
    capacity: 72,
    simulation: { startAt: { stopIndex: 1, fraction: 0.82 }, cruiseSpeedMps: 10, speedFactor: 1, initialDelaySeconds: 0, startDelaySeconds: 0, autoRestart: true },
  },
  {
    id: 'demo-bus-7',
    busNumber: '7',
    routeId: 'demo-route-2',
    status: 'in_transit',
    dataSource: 'demo_simulation',
    capacity: 72,
    simulation: { startAt: { stopIndex: 1, fraction: 0.35 }, cruiseSpeedMps: 10.5, speedFactor: 1, initialDelaySeconds: 30, startDelaySeconds: 0, autoRestart: true },
  },
  {
    id: 'demo-bus-23',
    busNumber: '23',
    routeId: 'demo-route-3',
    status: 'delayed',
    dataSource: 'demo_simulation',
    capacity: 72,
    simulation: { startAt: { stopIndex: 0, fraction: 0.6 }, cruiseSpeedMps: 10, speedFactor: 0.7, initialDelaySeconds: 420, startDelaySeconds: 0, autoRestart: true },
  },
  {
    id: 'demo-bus-50',
    busNumber: '50',
    routeId: 'demo-route-4',
    status: 'scheduled',
    dataSource: 'demo_simulation',
    capacity: 48,
    simulation: { startAt: 'route_start', cruiseSpeedMps: 10, speedFactor: 1, initialDelaySeconds: 0, startDelaySeconds: 120, autoRestart: true },
  },
  {
    id: 'demo-bus-31',
    busNumber: '31',
    routeId: 'demo-route-5',
    status: 'completed',
    dataSource: 'demo_simulation',
    capacity: 72,
    simulation: { startAt: 'route_end', cruiseSpeedMps: 10, speedFactor: 1, initialDelaySeconds: 0, startDelaySeconds: 0, autoRestart: false },
  },
  {
    id: 'demo-bus-44',
    busNumber: '44',
    routeId: 'demo-route-4',
    status: 'out_of_service',
    dataSource: 'demo_simulation',
    capacity: 72,
    simulation: null,
    lastKnown: { lat: DEPOT[0], lng: DEPOT[1], ageSeconds: 2 * 3600 },
  },
];

export const DEMO_PEOPLE = {
  studentNames: ['Jordan Rivera', 'Avery Chen', 'Sam Okafor', 'Riley Patel', 'Morgan Lee'],
  parentName: 'Casey Rivera',
};

export const DEMO_DWELL_SECONDS = 20;
