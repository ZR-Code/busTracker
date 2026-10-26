import type { DataSource, ProviderStatusDto, SimulationBusPhase } from '@busbuddy/shared';

export interface ProviderLocation {
  busId: string;
  lat: number;
  lng: number;
  heading: number;
  speedMps: number;
  recordedAt: Date;
  dataSource: DataSource;
  tripId: string;
  progressMeters?: number;
  simulation?: {
    phase: SimulationBusPhase;
    dwellRemainingSeconds: number;
    departsInSeconds: number;
    tripScheduledStartMs: number;
    timeScale: number;
    cruiseSpeedMps: number;
    running: boolean;
    speedMultiplier: number;
  };
}

export type LocationListener = (locations: ProviderLocation[]) => void;

export interface BusLocationProvider {
  readonly source: DataSource;
  getBusLocations(): Promise<ProviderLocation[]>;
  getBusLocation(busId: string): Promise<ProviderLocation | null>;
  subscribeToLocationUpdates(listener: LocationListener): () => void;
  getProviderStatus(): ProviderStatusDto;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
