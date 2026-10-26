import { describe, expect, it } from 'vitest';
import { linkStudentSchema, passwordSchema, routeStopsInputSchema, signupSchema, stopPreferenceSchema } from '../src/schemas';

describe('input validation', () => {
  it('requires strong-enough passwords', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('longpassword').success).toBe(false);
    expect(passwordSchema.safeParse('longpassword1').success).toBe(true);
  });

  it('never allows self-registration as an administrator', () => {
    const r = signupSchema.safeParse({ name: 'Ann', email: 'a@b.co', password: 'longpassword1', role: 'admin', schoolId: 'x' });
    expect(r.success).toBe(false);
  });

  it('only accepts supported reminder lead times', () => {
    expect(stopPreferenceSchema.safeParse({ reminderLeadMinutes: 5 }).success).toBe(true);
    expect(stopPreferenceSchema.safeParse({ reminderLeadMinutes: 7 }).success).toBe(false);
    expect(stopPreferenceSchema.safeParse({ reminderLeadMinutes: null }).success).toBe(true);
    expect(stopPreferenceSchema.safeParse({ favorite: true, extra: 1 }).success).toBe(false);
  });

  it('rejects duplicate stops on a route', () => {
    const stop = { stopId: 'a', scheduledArrivalTime: '07:00', scheduledDepartureTime: '07:00' };
    expect(routeStopsInputSchema.safeParse({ stops: [stop, stop] }).success).toBe(false);
    expect(routeStopsInputSchema.safeParse({ stops: [{ ...stop, scheduledArrivalTime: '25:00' }] }).success).toBe(false);
  });

  it('normalizes link codes', () => {
    expect(linkStudentSchema.parse({ code: ' abcd-1234 ' }).code).toBe('ABCD-1234');
    expect(linkStudentSchema.safeParse({ code: 'nope' }).success).toBe(false);
  });
});
