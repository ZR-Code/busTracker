import { describe, expect, it } from 'vitest';
import { FiredEventTracker, reminderEventKey, shouldFireReminder } from '../src/reminders';

describe('reminder threshold detection', () => {
  const ok = { etaSeconds: 280, leadMinutes: 5, stopState: 'next' as const, freshness: 'live' as const };
  it('fires once the ETA crosses the lead time', () => {
    expect(shouldFireReminder(ok)).toBe(true);
    expect(shouldFireReminder({ ...ok, etaSeconds: 301 })).toBe(false);
  });
  it('does not fire for passed stops, stale or missing data', () => {
    expect(shouldFireReminder({ ...ok, stopState: 'passed' })).toBe(false);
    expect(shouldFireReminder({ ...ok, freshness: 'stale' })).toBe(false);
    expect(shouldFireReminder({ ...ok, etaSeconds: null })).toBe(false);
  });
});

describe('duplicate prevention', () => {
  it('uses stable event keys per trip, bus, stop and lead time', () => {
    const k = reminderEventKey({ tripId: 't1', busId: 'b', stopId: 's', leadMinutes: 5 });
    expect(k).toBe(reminderEventKey({ tripId: 't1', busId: 'b', stopId: 's', leadMinutes: 5 }));
    expect(k).not.toBe(reminderEventKey({ tripId: 't2', busId: 'b', stopId: 's', leadMinutes: 5 }));
  });

  it('fires at most once across many location updates', () => {
    const tracker = new FiredEventTracker();
    const key = reminderEventKey({ tripId: 't1', busId: 'b', stopId: 's', leadMinutes: 5 });
    let fired = 0;
    for (let eta = 400; eta > 0; eta -= 3) {
      if (shouldFireReminder({ etaSeconds: eta, leadMinutes: 5, stopState: 'next', freshness: 'live' }) && tracker.markIfNew(`u1|${key}`)) fired++;
    }
    expect(fired).toBe(1);
  });

  it('re-arms for a new trip', () => {
    const tracker = new FiredEventTracker();
    expect(tracker.markIfNew('u|arrival:t1:b:s:5')).toBe(true);
    expect(tracker.markIfNew('u|arrival:t2:b:s:5')).toBe(true);
    tracker.clearTrip('t1');
    expect(tracker.has('u|arrival:t1:b:s:5')).toBe(false);
  });
});
