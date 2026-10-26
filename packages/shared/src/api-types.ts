import type {
  AnnouncementSeverity,
  BusStatus,
  DataSource,
  DistanceUnits,
  LocationFreshness,
  NotificationCategory,
  Role,
  SimulationBusPhase,
  ThemePreference,
  VerificationStatus,
} from './constants';
import type { Adherence, Confidence, Movement, StopState } from './eta';
import type { LatLngTuple } from './geo';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UserSettingsDto {
  reminderLeadMinutes: number;
  remindersEnabled: boolean;
  browserNotifications: boolean;
  distanceUnits: DistanceUnits;
  theme: ThemePreference;
}

export interface StudentProfileDto {
  schoolId: string;
  schoolName: string;
  assignedRouteId: string | null;
  assignedRouteName: string | null;
  defaultStopId: string | null;
  defaultStopName: string | null;
}

export interface MeDto {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  schoolId: string | null;
  isDemo: boolean;
  settings: UserSettingsDto;
  studentProfile: StudentProfileDto | null;
  permissions: { canSelfAssignRoute: boolean };
}

export interface AuthConfigDto {
  provider: 'local' | 'supabase';
  demoEnabled: boolean;
  passwordResetDelivery: 'email' | 'server_log' | 'provider';
  supabase: { url: string; anonKey: string } | null;
}

export interface SchoolDto {
  id: string;
  name: string;
  address: string;
  timeZone: string;
  lat: number;
  lng: number;
  isDemo: boolean;
}

export interface StopDto {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description: string;
  schoolId: string;
  routes: { id: string; name: string; number: string }[];
  favorite: boolean;
  reminderLeadMinutes: number | null;
}

export interface RouteStopDto {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
  description: string;
  order: number;
  scheduledArrivalTime: string;
  scheduledDepartureTime: string;
  distanceAlongMeters: number;
}

export type RouteServiceStatus = 'normal' | 'delayed' | 'disrupted' | 'inactive' | 'completed';

export interface RouteSummaryDto {
  id: string;
  name: string;
  number: string;
  schoolId: string;
  schoolName: string;
  active: boolean;
  color: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  stopCount: number;
  firstPickupTime: string | null;
  buses: { id: string; busNumber: string; status: BusStatus }[];
  serviceStatus: RouteServiceStatus;
  isDemo: boolean;
}

export interface RouteDetailDto extends RouteSummaryDto {
  geometry: LatLngTuple[];
  geometrySource: 'stored' | 'straight_line';
  lengthMeters: number;
  stops: RouteStopDto[];
}

export interface BusDto {
  id: string;
  busNumber: string;
  schoolId: string;
  routeId: string | null;
  routeName: string | null;
  routeNumber: string | null;
  status: BusStatus;
  dataSource: DataSource;
  capacity: number;
}

export interface BusLocationDto {
  lat: number;
  lng: number;
  heading: number;
  speedMps: number;
  recordedAt: string;
  dataSource: DataSource;
}

export interface StopEtaDto {
  stopId: string;
  name: string;
  order: number;
  state: StopState;
  distanceMeters: number | null;
  etaSeconds: number | null;
  estimatedAt: string | null;
  scheduledAt: string | null;
  deviationSeconds: number | null;
}

export interface BusLiveDto {
  bus: BusDto;
  location: BusLocationDto | null;
  freshness: LocationFreshness;
  ageSeconds: number | null;
  movement: Movement;
  progressMeters: number | null;
  routeLengthMeters: number | null;
  stops: StopEtaDto[];
  nextStopId: string | null;
  selectedStopId: string | null;
  adherence: Adherence;
  deviationSeconds: number | null;
  uncertain: boolean;
  confidence: Confidence;
  tripId: string | null;
  simulation: { phase: SimulationBusPhase; running: boolean; speedMultiplier: number } | null;
  serverTime: string;
}

export interface NotificationDto {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  busId: string | null;
  busNumber: string | null;
  stopId: string | null;
  stopName: string | null;
  routeId: string | null;
  routeName: string | null;
  isDemo: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface AnnouncementDto {
  id: string;
  schoolId: string;
  routes: { id: string; name: string; number: string }[];
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  category: NotificationCategory;
  publishedAt: string;
  expiresAt: string | null;
  publishedBy: string | null;
  isDemo: boolean;
  active: boolean;
}

export interface LinkedStudentDto {
  relationshipId: string;
  status: VerificationStatus;
  createdAt: string;
  student: {
    id: string;
    name: string;
    schoolName: string;
    assignedRouteId: string | null;
    assignedRouteName: string | null;
    defaultStopId: string | null;
    defaultStopName: string | null;
    busId: string | null;
  } | null;
}

export interface StudentTransportationDto {
  studentId: string;
  name: string;
  schoolName: string;
  route: RouteSummaryDto | null;
  defaultStop: { id: string; name: string } | null;
  busId: string | null;
}

export interface LinkCodeDto {
  code: string;
  expiresAt: string;
}

export interface SimulationStatusDto {
  running: boolean;
  speedMultiplier: number;
  simClockSeconds: number;
  resetAt: string;
  buses: {
    busId: string;
    busNumber: string;
    routeName: string | null;
    phase: SimulationBusPhase;
    status: BusStatus;
    progressFraction: number;
    tripNumber: number;
    autoRestart: boolean;
  }[];
}

export interface AdminOverviewDto {
  counts: { activeBuses: number; totalBuses: number; activeRoutes: number; totalRoutes: number; totalStops: number; activeAlerts: number; pendingParentLinks: number };
  busStatus: { status: BusStatus; count: number }[];
  routeStatus: { id: string; name: string; number: string; serviceStatus: RouteServiceStatus; busNumbers: string[] }[];
  activity: AuditEntryDto[];
  providers: ProviderStatusDto[];
}

export interface AuditEntryDto {
  id: string;
  action: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
}

export interface ProviderStatusDto {
  source: DataSource;
  name: string;
  state: 'active' | 'idle' | 'not_configured' | 'error';
  message: string;
  lastUpdateAt: string | null;
}

export interface AnalyticsDto {
  isSimulated: boolean;
  generatedAt: string;
  onTimePercentage: number | null;
  averageDeviationSeconds: number | null;
  activeBuses: number;
  routes: { id: string; name: string; number: string; progressFraction: number; status: BusStatus | 'none'; deviationSeconds: number | null }[];
}

export interface AdminParentLinkDto {
  id: string;
  status: VerificationStatus;
  parentName: string;
  parentEmail: string | null;
  studentName: string;
  schoolName: string;
  createdAt: string;
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  database: 'ok' | 'error';
  version: string;
  providers: ProviderStatusDto[];
}
