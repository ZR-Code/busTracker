import type { PrismaClient } from '@prisma/client';
import type { ProviderStatusDto, SimulationStatusDto } from '@busbuddy/shared';
import { DEMO_DWELL_SECONDS } from '@busbuddy/shared/demo';
import { logger } from '../lib/logger';
import { makeSimRoute, SimulationEngine, type SimBusConfig, type SimBusState, type SimEvent } from '../simulation/engine';
import type { RouteCache } from '../services/route-cache';
import type { BusLocationProvider, LocationListener, ProviderLocation } from './types';

export interface SimulationProviderOptions {
  enabled: boolean;
  tickMs: number;
  restartDelaySeconds: number;
  autoResetAfterMinutes: number;
  persistEveryTicks?: number;
  manualTicks?: boolean;
}

export type SimEventListener = (events: SimEvent[]) => void;

export class SimulationProvider implements BusLocationProvider {
  readonly source = 'demo_simulation' as const;
  readonly engine: SimulationEngine;
  running = true;
  speedMultiplier = 1;
  resetAt = new Date();
  private lastTickAt: Date | null = null;
  private restoredAt: Date | null = null;
  private timer: NodeJS.Timeout | null = null;
  private ticks = 0;
  private persisting = false;
  private readonly listeners = new Set<LocationListener>();
  private readonly eventListeners = new Set<SimEventListener>();
  private readonly busNumbers = new Map<string, string>();
  private lastError: string | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly routes: RouteCache,
    private readonly opts: SimulationProviderOptions,
  ) {
    this.engine = new SimulationEngine({ dwellSeconds: DEMO_DWELL_SECONDS, restartDelaySeconds: opts.restartDelaySeconds });
  }

  async start(): Promise<void> {
    if (!this.opts.enabled) return;
    const settings = await this.prisma.simulationSettings.upsert({ where: { id: 'global' }, create: { id: 'global' }, update: {} });
    this.running = settings.running;
    this.speedMultiplier = settings.speedMultiplier;
    this.resetAt = settings.resetAt;
    this.engine.simClockSeconds = settings.simClockSeconds;
    await this.reload(true);
    const ageMinutes = (Date.now() - settings.updatedAt.getTime()) / 60_000;
    if (ageMinutes > this.opts.autoResetAfterMinutes) {
      logger.info('Saved simulation state is old; restoring deterministic demo start', { ageMinutes: Math.round(ageMinutes) });
      await this.reset();
    }
    if (this.running) this.lastTickAt = new Date();
    if (!this.opts.manualTicks) this.timer = setInterval(() => void this.tick(), this.opts.tickMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.opts.enabled) await this.persist().catch(() => {});
  }

  async reload(fromDatabase = false): Promise<void> {
    const rows = await this.prisma.simulationState.findMany({
      where: { bus: { dataSource: 'demo_simulation', status: { not: 'out_of_service' }, routeId: { not: null } } },
      include: { bus: { select: { routeId: true, busNumber: true } } },
    });
    const routeMap = await this.routes.all();
    const simRoutes = [...routeMap.values()]
      .filter((r) => r.path && r.stops.length > 0)
      .map((r) =>
        makeSimRoute(
          r.id,
          r.geometry,
          r.stops.map((s) => ({ stopId: s.stopId, distanceAlongMeters: s.distanceAlongMeters, scheduleOffsetSeconds: s.scheduleOffsetSeconds })),
        ),
      );
    const configs: SimBusConfig[] = [];
    const persisted: Record<string, SimBusState> = {};
    this.busNumbers.clear();
    for (const row of rows) {
      const routeId = row.bus.routeId!;
      this.busNumbers.set(row.busId, row.bus.busNumber);
      configs.push({
        busId: row.busId,
        routeId,
        cruiseSpeedMps: row.cruiseSpeedMps,
        speedFactor: row.speedFactor,
        initialProgressMeters: row.initialProgressMeters,
        initialPhase: row.initialPhase,
        initialDelaySeconds: row.initialDelaySeconds,
        startDelaySeconds: row.startDelaySeconds,
        autoRestart: row.autoRestart,
      });
      if (fromDatabase) {
        persisted[row.busId] = {
          busId: row.busId,
          routeId,
          phase: row.phase,
          progressMeters: row.progressMeters,
          speedMps: row.speedMps,
          heading: 0,
          segmentIndex: row.segmentIndex,
          nextStopIndex: row.nextStopIndex,
          dwellRemainingSeconds: row.dwellRemainingSeconds,
          waitRemainingSeconds: row.waitRemainingSeconds,
          tripNumber: row.tripNumber,
          tripScheduledStartSec: row.tripScheduledStartSec,
        };
        this.restoredAt = row.lastUpdateAt;
      }
    }
    this.engine.load(simRoutes, configs, persisted);
    for (const s of this.engine.allStates()) {
      const p = this.engine.position(s.busId);
      if (p) s.heading = p.heading;
    }
  }

  async tick(): Promise<void> {
    if (!this.running) return;
    const events = this.engine.step((this.opts.tickMs / 1000) * this.speedMultiplier);
    this.lastTickAt = new Date();
    this.ticks += 1;
    if (events.length) for (const l of this.eventListeners) l(events);
    if (this.listeners.size) {
      const locs = await this.getBusLocations();
      for (const l of this.listeners) l(locs);
    }
    if (this.ticks % (this.opts.persistEveryTicks ?? 5) === 0) await this.persist();
  }

  async persist(): Promise<void> {
    if (this.persisting) return;
    this.persisting = true;
    try {
      const now = new Date();
      const states = this.engine.allStates();
      await this.prisma.$transaction([
        ...states.map((s) =>
          this.prisma.simulationState.update({
            where: { busId: s.busId },
            data: {
              phase: s.phase,
              progressMeters: s.progressMeters,
              segmentIndex: s.segmentIndex,
              nextStopIndex: s.nextStopIndex,
              speedMps: s.speedMps,
              dwellRemainingSeconds: s.dwellRemainingSeconds,
              waitRemainingSeconds: s.waitRemainingSeconds,
              tripNumber: s.tripNumber,
              tripScheduledStartSec: s.tripScheduledStartSec,
              lastUpdateAt: now,
            },
          }),
        ),
        this.prisma.simulationSettings.update({
          where: { id: 'global' },
          data: { running: this.running, speedMultiplier: this.speedMultiplier, simClockSeconds: this.engine.simClockSeconds },
        }),
      ]);
      const samples = states
        .filter((s) => this.running && (s.phase === 'moving' || s.phase === 'dwelling'))
        .map((s) => {
          const p = this.engine.position(s.busId)!;
          return { busId: s.busId, lat: p.lat, lng: p.lng, heading: s.heading, speedMps: s.speedMps, recordedAt: now, dataSource: 'demo_simulation' as const };
        });
      if (samples.length) await this.prisma.busLocation.createMany({ data: samples });
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      logger.warn('Failed to persist simulation state', { error: this.lastError });
    } finally {
      this.persisting = false;
    }
  }

  async pause(): Promise<void> {
    this.running = false;
    await this.persist();
  }

  async resume(): Promise<void> {
    this.running = true;
    this.lastTickAt = new Date();
    await this.persist();
  }

  async setSpeed(multiplier: number): Promise<void> {
    this.speedMultiplier = multiplier;
    await this.persist();
  }

  async reset(): Promise<void> {
    await this.reload(false);
    this.engine.reset();
    this.resetAt = new Date();
    this.lastTickAt = new Date();
    this.running = true;
    this.speedMultiplier = 1;
    await this.prisma.busLocation.deleteMany({ where: { dataSource: 'demo_simulation' } });
    await this.prisma.simulationSettings.update({ where: { id: 'global' }, data: { resetAt: this.resetAt, simClockSeconds: 0, running: true, speedMultiplier: 1 } });
    await this.persist();
  }

  isSimulated(busId: string): boolean {
    return this.engine.getState(busId) !== undefined;
  }

  tripId(state: SimBusState): string {
    return `sim-${this.resetAt.getTime()}-${state.busId}-${state.tripNumber}`;
  }

  private toLocation(s: SimBusState): ProviderLocation | null {
    const pos = this.engine.position(s.busId);
    const config = this.engine.getConfig(s.busId);
    if (!pos || !config) return null;
    const nowMs = Date.now();
    const scale = this.speedMultiplier;
    const recordedAt = this.lastTickAt ?? this.restoredAt ?? new Date(nowMs);
    return {
      busId: s.busId,
      lat: pos.lat,
      lng: pos.lng,
      heading: s.heading,
      speedMps: s.speedMps,
      recordedAt,
      dataSource: 'demo_simulation',
      tripId: this.tripId(s),
      progressMeters: s.progressMeters,
      simulation: {
        phase: s.phase,
        dwellRemainingSeconds: s.phase === 'dwelling' ? s.dwellRemainingSeconds : 0,
        departsInSeconds: s.phase === 'waiting' ? s.waitRemainingSeconds : 0,
        tripScheduledStartMs: nowMs + ((s.tripScheduledStartSec - this.engine.simClockSeconds) / scale) * 1000,
        timeScale: scale,
        cruiseSpeedMps: config.cruiseSpeedMps * config.speedFactor,
        running: this.running,
        speedMultiplier: this.speedMultiplier,
      },
    };
  }

  async getBusLocations(): Promise<ProviderLocation[]> {
    return this.engine
      .allStates()
      .map((s) => this.toLocation(s))
      .filter((l): l is ProviderLocation => l !== null);
  }

  async getBusLocation(busId: string): Promise<ProviderLocation | null> {
    const s = this.engine.getState(busId);
    return s ? this.toLocation(s) : null;
  }

  subscribeToLocationUpdates(listener: LocationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onEvents(listener: SimEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  status(): SimulationStatusDto {
    return {
      running: this.running,
      speedMultiplier: this.speedMultiplier,
      simClockSeconds: Math.round(this.engine.simClockSeconds),
      resetAt: this.resetAt.toISOString(),
      buses: this.engine.allStates().map((s) => {
        const route = this.engine.getRoute(s.routeId);
        const length = route?.path.lengthMeters ?? 1;
        return {
          busId: s.busId,
          busNumber: this.busNumbers.get(s.busId) ?? '?',
          routeName: null,
          phase: s.phase,
          status: 'scheduled',
          progressFraction: Math.min(1, s.progressMeters / length),
          tripNumber: s.tripNumber,
          autoRestart: this.engine.getConfig(s.busId)?.autoRestart ?? false,
        };
      }),
    };
  }

  getProviderStatus(): ProviderStatusDto {
    if (!this.opts.enabled) return { source: this.source, name: 'Demo simulation', state: 'not_configured', message: 'SIMULATION_ENABLED=false', lastUpdateAt: null };
    if (this.lastError) return { source: this.source, name: 'Demo simulation', state: 'error', message: this.lastError, lastUpdateAt: this.lastTickAt?.toISOString() ?? null };
    return {
      source: this.source,
      name: 'Demo simulation',
      state: this.running ? 'active' : 'idle',
      message: this.running ? `Simulating ${this.engine.allStates().length} buses at ${this.speedMultiplier}×` : 'Paused by an administrator',
      lastUpdateAt: this.lastTickAt?.toISOString() ?? null,
    };
  }
}
