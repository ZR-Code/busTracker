import type { LocationFreshness } from './constants';
import type { StopState } from './eta';

export interface ReminderKeyParts {
  tripId: string;
  busId: string;
  stopId: string;
  leadMinutes: number;
}

export function reminderEventKey(p: ReminderKeyParts): string {
  return `arrival:${p.tripId}:${p.busId}:${p.stopId}:${p.leadMinutes}`;
}

export function delayEventKey(tripId: string, busId: string): string {
  return `delay:${tripId}:${busId}`;
}

export interface ReminderCheck {
  etaSeconds: number | null;
  leadMinutes: number;
  stopState: StopState;
  freshness: LocationFreshness;
}

export function shouldFireReminder(c: ReminderCheck): boolean {
  if (c.etaSeconds === null || c.leadMinutes <= 0) return false;
  if (c.stopState === 'passed' || c.stopState === 'unknown') return false;
  if (c.freshness === 'stale' || c.freshness === 'unavailable') return false;
  return c.etaSeconds <= c.leadMinutes * 60;
}

export class FiredEventTracker {
  private readonly keys = new Map<string, number>();

  constructor(private readonly maxEntries = 10_000) {}

  markIfNew(key: string, nowMs = Date.now()): boolean {
    if (this.keys.has(key)) return false;
    this.keys.set(key, nowMs);
    if (this.keys.size > this.maxEntries) {
      const oldest = this.keys.keys().next().value;
      if (oldest !== undefined) this.keys.delete(oldest);
    }
    return true;
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }

  clearTrip(tripId: string): void {
    for (const k of this.keys.keys()) if (k.includes(`:${tripId}:`)) this.keys.delete(k);
  }

  clear(): void {
    this.keys.clear();
  }
}

export function reminderMessage(busNumber: string, stopName: string, etaSeconds: number): { title: string; body: string } {
  const minutes = Math.max(1, Math.round(etaSeconds / 60));
  const when = etaSeconds < 60 ? 'less than a minute' : `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
  return {
    title: `Bus ${busNumber} is approaching ${stopName}`,
    body: `Estimated arrival in ${when}. Arrival times are estimates.`,
  };
}
