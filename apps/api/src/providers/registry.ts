import type { DataSource, ProviderStatusDto } from '@busbuddy/shared';
import type { DistrictGpsProvider, ManualTestProvider } from './db-providers';
import type { SimulationProvider } from './simulation-provider';
import type { BusLocationProvider } from './types';

export class ProviderRegistry {
  constructor(
    readonly simulation: SimulationProvider,
    readonly manual: ManualTestProvider,
    readonly district: DistrictGpsProvider,
  ) {}

  forSource(source: DataSource): BusLocationProvider {
    switch (source) {
      case 'demo_simulation':
        return this.simulation;
      case 'manual_test':
        return this.manual;
      case 'district_gps':
        return this.district;
    }
  }

  statuses(): ProviderStatusDto[] {
    return [this.simulation.getProviderStatus(), this.district.getProviderStatus(), this.manual.getProviderStatus()];
  }

  async startAll(): Promise<void> {
    await this.simulation.start();
    await this.district.start();
  }

  async stopAll(): Promise<void> {
    await this.simulation.stop();
    await this.district.stop();
  }
}
