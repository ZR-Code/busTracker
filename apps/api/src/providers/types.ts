import type { DataSource, LiveLocation, ProviderStatusDto } from '@busbuddy/shared';

export type ProviderLocation = LiveLocation;

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
