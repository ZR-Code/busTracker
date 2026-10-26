import type { DistanceUnits } from './constants';

export function formatDistance(meters: number | null, units: DistanceUnits = 'imperial'): string {
  if (meters === null || !Number.isFinite(meters)) return '—';
  if (units === 'metric') {
    return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
  }
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet / 10) * 10} ft`;
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

export function formatSpeed(mps: number, units: DistanceUnits = 'imperial'): string {
  return units === 'metric' ? `${Math.round(mps * 3.6)} km/h` : `${Math.round(mps * 2.23694)} mph`;
}

export function formatEta(etaSeconds: number | null): string {
  if (etaSeconds === null) return '—';
  if (etaSeconds < 45) return 'Arriving now';
  return `${Math.max(1, Math.round(etaSeconds / 60))} min`;
}

export function formatDeviation(seconds: number | null): string {
  if (seconds === null) return '';
  const mins = Math.round(Math.abs(seconds) / 60);
  if (mins === 0) return 'On schedule';
  return seconds > 0 ? `${mins} min behind schedule` : `${mins} min ahead of schedule`;
}

export function formatClock(iso: string | number | Date | null, timeZone?: string): string {
  if (iso === null) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) });
}

export function formatTimeOfDay(hhmm: string | null): string {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function minutesFromTimeOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function timeOfDayFromMinutes(total: number): string {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function formatRelative(iso: string | Date, nowMs = Date.now()): string {
  const t = (iso instanceof Date ? iso : new Date(iso)).getTime();
  const s = Math.round((nowMs - t) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s} sec ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86_400)} d ago`;
}
