export const ROLES = ['student', 'parent', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const BUS_STATUSES = [
  'scheduled',
  'in_transit',
  'approaching_stop',
  'at_stop',
  'delayed',
  'out_of_service',
  'completed',
] as const;
export type BusStatus = (typeof BUS_STATUSES)[number];

export const DATA_SOURCES = ['demo_simulation', 'district_gps', 'manual_test'] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const LOCATION_FRESHNESS = ['live', 'simulated', 'manual', 'stale', 'unavailable'] as const;
export type LocationFreshness = (typeof LOCATION_FRESHNESS)[number];

export const NOTIFICATION_CATEGORIES = [
  'bus_approaching',
  'delay',
  'route_change',
  'service_cancellation',
  'general',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const ANNOUNCEMENT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AnnouncementSeverity = (typeof ANNOUNCEMENT_SEVERITIES)[number];

export const VERIFICATION_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const SIMULATION_BUS_PHASES = ['waiting', 'moving', 'dwelling', 'completed', 'out_of_service'] as const;
export type SimulationBusPhase = (typeof SIMULATION_BUS_PHASES)[number];

export const REMINDER_LEAD_OPTIONS = [2, 5, 10] as const;
export type ReminderLeadMinutes = (typeof REMINDER_LEAD_OPTIONS)[number];

export const DISTANCE_UNITS = ['imperial', 'metric'] as const;
export type DistanceUnits = (typeof DISTANCE_UNITS)[number];

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const SIMULATION_SPEEDS = [1, 2, 5, 10] as const;

export const BUS_STATUS_LABELS: Record<BusStatus, string> = {
  scheduled: 'Scheduled',
  in_transit: 'In transit',
  approaching_stop: 'Approaching stop',
  at_stop: 'At stop',
  delayed: 'Delayed',
  out_of_service: 'Out of service',
  completed: 'Route completed',
};

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  demo_simulation: 'Demo simulation',
  district_gps: 'District GPS',
  manual_test: 'Manual test data',
};

export const FRESHNESS_LABELS: Record<LocationFreshness, string> = {
  live: 'Live GPS',
  simulated: 'DEMO LIVE SIMULATION',
  manual: 'Manual test location',
  stale: 'Location update delayed',
  unavailable: 'Location unavailable',
};

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  bus_approaching: 'Bus approaching',
  delay: 'Delay',
  route_change: 'Route change',
  service_cancellation: 'Service cancellation',
  general: 'General announcement',
};

export const ETA_THRESHOLDS = {
  passedToleranceMeters: 15,
  approachingMeters: 400,
  stationarySpeedMps: 0.5,
  atStopMeters: 30,
  lateSeconds: 180,
  delayedSeconds: 300,
  earlySeconds: -120,
} as const;

export const DEMO_LABEL = 'DEMO LIVE SIMULATION';
