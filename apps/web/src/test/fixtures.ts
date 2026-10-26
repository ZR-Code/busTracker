import type { BusLiveDto, MeDto, RouteDetailDto, RouteSummaryDto, StopDto } from '@busbuddy/shared';

const now = Date.now();
const iso = (offsetS: number) => new Date(now + offsetS * 1000).toISOString();

export const me: MeDto = {
  id: 'u1',
  name: 'Jordan Rivera (demo)',
  email: null,
  role: 'student',
  schoolId: 'school',
  isDemo: true,
  settings: { reminderLeadMinutes: 5, remindersEnabled: true, browserNotifications: false, distanceUnits: 'imperial', theme: 'light' },
  studentProfile: { schoolId: 'school', schoolName: 'Maplewood Valley High School', assignedRouteId: 'r1', assignedRouteName: 'Route 1 – North Maple', defaultStopId: 's2', defaultStopName: 'Copper Kettle Park' },
  permissions: { canSelfAssignRoute: true },
};

export function live(over: Partial<BusLiveDto> = {}): BusLiveDto {
  return {
    bus: { id: 'b12', busNumber: '12', schoolId: 'school', routeId: 'r1', routeName: 'North Maple', routeNumber: '1', status: 'in_transit', dataSource: 'demo_simulation', capacity: 72 },
    location: { lat: 41.75, lng: -88.16, heading: 90, speedMps: 9, recordedAt: iso(-1), dataSource: 'demo_simulation' },
    freshness: 'simulated',
    ageSeconds: 1,
    movement: 'moving',
    progressMeters: 1000,
    routeLengthMeters: 5000,
    stops: [
      { stopId: 's1', name: 'Juniper Bend', order: 1, state: 'passed', distanceMeters: 0, etaSeconds: null, estimatedAt: null, scheduledAt: iso(-300), deviationSeconds: null },
      { stopId: 's2', name: 'Copper Kettle Park', order: 2, state: 'next', distanceMeters: 1600, etaSeconds: 240, estimatedAt: iso(240), scheduledAt: iso(250), deviationSeconds: -10 },
      { stopId: 's3', name: 'Maplewood Valley HS — Bus Loop', order: 3, state: 'upcoming', distanceMeters: 4000, etaSeconds: 520, estimatedAt: iso(520), scheduledAt: iso(540), deviationSeconds: -20 },
    ],
    nextStopId: 's2',
    selectedStopId: 's2',
    adherence: 'on_time',
    deviationSeconds: -10,
    uncertain: false,
    confidence: { level: 'high', score: 100, reasons: ['Recent location'] },
    tripId: 'trip',
    simulation: { phase: 'moving', running: true, speedMultiplier: 1 },
    serverTime: iso(0),
    ...over,
  };
}

export const routeSummary: RouteSummaryDto = {
  id: 'r1',
  name: 'North Maple',
  number: '1',
  schoolId: 'school',
  schoolName: 'Maplewood Valley High School',
  active: true,
  color: '#2878E5',
  scheduledStartTime: '07:00',
  scheduledEndTime: '07:21',
  stopCount: 3,
  firstPickupTime: '07:00',
  buses: [{ id: 'b12', busNumber: '12', status: 'in_transit' }],
  serviceStatus: 'normal',
  isDemo: true,
};

export const routeDetail: RouteDetailDto = {
  ...routeSummary,
  geometry: [
    [41.75, -88.17],
    [41.75, -88.15],
  ],
  geometrySource: 'stored',
  lengthMeters: 5000,
  stops: live().stops.map((s, i) => ({ stopId: s.stopId, name: s.name, lat: 41.75, lng: -88.17 + i * 0.01, description: `Desc ${s.name}`, order: s.order, scheduledArrivalTime: '07:00', scheduledDepartureTime: '07:00', distanceAlongMeters: i * 2000 })),
};

export const stops: StopDto[] = routeDetail.stops.map((s) => ({ id: s.stopId, name: s.name, lat: s.lat, lng: s.lng, description: s.description, schoolId: 'school', routes: [{ id: 'r1', name: 'North Maple', number: '1' }], favorite: s.stopId === 's2', reminderLeadMinutes: s.stopId === 's2' ? 5 : null }));
