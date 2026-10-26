import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { DataSource, ProviderStatusDto } from '@busbuddy/shared';
import { logger } from '../lib/logger';
import type { BusLocationProvider, LocationListener, ProviderLocation } from './types';

export interface LocationSample {
  busId: string;
  lat: number;
  lng: number;
  heading: number;
  speedMps: number;
  recordedAt: Date;
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export class DbLocationProvider implements BusLocationProvider {
  protected readonly listeners = new Set<LocationListener>();
  protected lastUpdateAt: Date | null = null;

  constructor(
    protected readonly prisma: PrismaClient,
    readonly source: Extract<DataSource, 'manual_test' | 'district_gps'>,
    protected readonly displayName: string,
  ) {}

  protected toLocation(row: { busId: string; lat: number; lng: number; heading: number; speedMps: number; recordedAt: Date }): ProviderLocation {
    return {
      busId: row.busId,
      lat: row.lat,
      lng: row.lng,
      heading: row.heading,
      speedMps: row.speedMps,
      recordedAt: row.recordedAt,
      dataSource: this.source,
      tripId: `${this.source}-${row.busId}-${utcDay(row.recordedAt)}`,
    };
  }

  async getBusLocation(busId: string): Promise<ProviderLocation | null> {
    const row = await this.prisma.busLocation.findFirst({ where: { busId, dataSource: this.source }, orderBy: { recordedAt: 'desc' } });
    return row ? this.toLocation(row) : null;
  }

  async getBusLocations(): Promise<ProviderLocation[]> {
    const buses = await this.prisma.bus.findMany({ where: { dataSource: this.source }, select: { id: true } });
    const out: ProviderLocation[] = [];
    for (const b of buses) {
      const loc = await this.getBusLocation(b.id);
      if (loc) out.push(loc);
    }
    return out;
  }

  async record(samples: LocationSample[]): Promise<number> {
    if (samples.length === 0) return 0;
    const res = await this.prisma.busLocation.createMany({ data: samples.map((s) => ({ ...s, dataSource: this.source })) });
    this.lastUpdateAt = new Date();
    const locs = samples.map((s) => this.toLocation(s));
    for (const l of this.listeners) l(locs);
    return res.count;
  }

  subscribeToLocationUpdates(listener: LocationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getProviderStatus(): ProviderStatusDto {
    return {
      source: this.source,
      name: this.displayName,
      state: this.lastUpdateAt ? 'active' : 'idle',
      message: this.lastUpdateAt ? 'Receiving locations' : 'No locations received since the server started',
      lastUpdateAt: this.lastUpdateAt?.toISOString() ?? null,
    };
  }
}

export class ManualTestProvider extends DbLocationProvider {
  constructor(prisma: PrismaClient) {
    super(prisma, 'manual_test', 'Manual test locations');
  }
}

export const districtFeedSchema = z.object({
  vehicles: z.array(
    z.object({
      busNumber: z.string().min(1).max(12),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      headingDegrees: z.number().min(0).max(360).optional(),
      speedMps: z.number().min(0).max(60).optional(),
      timestamp: z.string().datetime(),
    }),
  ),
});
export type DistrictFeed = z.infer<typeof districtFeedSchema>;

export interface DistrictGpsOptions {
  baseUrl: string | null;
  apiKey: string | null;
  pollSeconds: number;
  fetchImpl?: typeof fetch;
}

export class DistrictGpsProvider extends DbLocationProvider {
  private timer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;

  constructor(
    prisma: PrismaClient,
    private readonly opts: DistrictGpsOptions,
  ) {
    super(prisma, 'district_gps', 'District GPS');
  }

  get configured(): boolean {
    return Boolean(this.opts.baseUrl && this.opts.apiKey);
  }

  async start(): Promise<void> {
    if (!this.configured) return;
    this.timer = setInterval(() => void this.poll(), this.opts.pollSeconds * 1000);
    await this.poll();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async mapFeed(feed: DistrictFeed): Promise<LocationSample[]> {
    const buses = await this.prisma.bus.findMany({ where: { dataSource: 'district_gps' }, select: { id: true, busNumber: true } });
    const byNumber = new Map(buses.map((b) => [b.busNumber, b.id]));
    const out: LocationSample[] = [];
    for (const v of feed.vehicles) {
      const busId = byNumber.get(v.busNumber);
      if (!busId) continue;
      out.push({ busId, lat: v.latitude, lng: v.longitude, heading: v.headingDegrees ?? 0, speedMps: v.speedMps ?? 0, recordedAt: new Date(v.timestamp) });
    }
    return out;
  }

  async poll(): Promise<void> {
    if (!this.configured) return;
    try {
      const fetchImpl = this.opts.fetchImpl ?? fetch;
      const res = await fetchImpl(new URL('vehicles/locations', this.opts.baseUrl!.endsWith('/') ? this.opts.baseUrl! : `${this.opts.baseUrl}/`), {
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Feed responded with HTTP ${res.status}`);
      const feed = districtFeedSchema.parse(await res.json());
      await this.record(await this.mapFeed(feed));
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      logger.warn('District GPS poll failed', { error: this.lastError });
    }
  }

  override getProviderStatus(): ProviderStatusDto {
    if (!this.configured && !this.lastUpdateAt) {
      return { source: this.source, name: this.displayName, state: 'not_configured', message: 'No district GPS feed configured. See docs/GPS_INTEGRATION.md.', lastUpdateAt: null };
    }
    if (this.lastError) return { source: this.source, name: this.displayName, state: 'error', message: this.lastError, lastUpdateAt: this.lastUpdateAt?.toISOString() ?? null };
    return super.getProviderStatus();
  }
}
