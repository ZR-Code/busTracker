import { z } from 'zod';
import {
  ANNOUNCEMENT_SEVERITIES,
  BUS_STATUSES,
  DATA_SOURCES,
  DISTANCE_UNITS,
  NOTIFICATION_CATEGORIES,
  REMINDER_LEAD_OPTIONS,
  SIMULATION_SPEEDS,
  THEME_PREFERENCES,
} from './constants';

const id = z.string().trim().min(1).max(64);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM format');
const name = z.string().trim().min(1, 'Required').max(120);

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['student', 'parent']),
  schoolId: id,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });

export const demoSessionSchema = z.object({ persona: z.enum(['student', 'parent']).default('student') });

export const reminderLeadSchema = z.union(REMINDER_LEAD_OPTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<2>, z.ZodLiteral<5>, z.ZodLiteral<10>]);

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    settings: z
      .object({
        reminderLeadMinutes: reminderLeadSchema.optional(),
        remindersEnabled: z.boolean().optional(),
        browserNotifications: z.boolean().optional(),
        distanceUnits: z.enum(DISTANCE_UNITS).optional(),
        theme: z.enum(THEME_PREFERENCES).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateStudentProfileSchema = z
  .object({
    schoolId: id.optional(),
    assignedRouteId: id.nullable().optional(),
    defaultStopId: id.nullable().optional(),
  })
  .strict();
export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;

export const stopPreferenceSchema = z
  .object({
    favorite: z.boolean().optional(),
    reminderLeadMinutes: reminderLeadSchema.nullable().optional(),
  })
  .strict();
export type StopPreferenceInput = z.infer<typeof stopPreferenceSchema>;

export const linkStudentSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Enter the 8-character code in the form ABCD-1234'),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(64).optional(),
});

export const notificationQuerySchema = paginationSchema.extend({
  category: z.enum(NOTIFICATION_CATEGORIES).optional(),
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  routeId: id.optional(),
  schoolId: id.optional(),
});

export const idParamSchema = z.object({ id });

export const liveQuerySchema = z.object({ stopId: id.optional() });

export const historyQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

export const schoolInputSchema = z.object({
  name,
  address: z.string().trim().min(1).max(200),
  timeZone: z.string().trim().min(1).max(64),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const stopInputSchema = z.object({
  name,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  description: z.string().trim().max(300).default(''),
  schoolId: id,
});
export type StopInput = z.infer<typeof stopInputSchema>;

const geometrySchema = z
  .array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
  .min(2, 'Geometry needs at least two points')
  .max(5000);

export const routeInputSchema = z.object({
  name,
  number: z.string().trim().min(1).max(12),
  schoolId: id,
  active: z.boolean().default(true),
  scheduledStartTime: timeOfDay,
  scheduledEndTime: timeOfDay,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#2878E5'),
  geometry: geometrySchema.nullable().optional(),
});
export type RouteInput = z.infer<typeof routeInputSchema>;

export const routeStopsInputSchema = z.object({
  stops: z
    .array(
      z.object({
        stopId: id,
        scheduledArrivalTime: timeOfDay,
        scheduledDepartureTime: timeOfDay,
      }),
    )
    .max(60)
    .refine((stops) => new Set(stops.map((s) => s.stopId)).size === stops.length, 'A stop can appear only once per route'),
  regenerateGeometry: z.boolean().default(false),
});
export type RouteStopsInput = z.infer<typeof routeStopsInputSchema>;

export const busInputSchema = z.object({
  busNumber: z.string().trim().min(1).max(12),
  schoolId: id,
  routeId: id.nullable().default(null),
  status: z.enum(BUS_STATUSES).default('scheduled'),
  dataSource: z.enum(DATA_SOURCES).default('demo_simulation'),
  capacity: z.number().int().min(1).max(120).default(72),
});
export type BusInput = z.infer<typeof busInputSchema>;

export const manualLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).default(0),
  speedMps: z.number().min(0).max(45).default(0),
  ageSeconds: z.number().int().min(0).max(86_400).default(0),
});

export const announcementInputSchema = z.object({
  schoolId: id,
  routeIds: z.array(id).max(20).default([]),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
  severity: z.enum(ANNOUNCEMENT_SEVERITIES).default('info'),
  category: z.enum(NOTIFICATION_CATEGORIES).default('general'),
  expiresAt: z.string().datetime().nullable().optional(),
  notifyUsers: z.boolean().default(true),
});
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export const simulationSpeedSchema = z.object({
  speedMultiplier: z.union(SIMULATION_SPEEDS.map((n) => z.literal(n)) as [z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<5>, z.ZodLiteral<10>]),
});

export const ingestLocationsSchema = z.object({
  locations: z
    .array(
      z.object({
        busNumber: z.string().trim().min(1).max(12),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        heading: z.number().min(0).max(360).optional(),
        speedMps: z.number().min(0).max(60).optional(),
        recordedAt: z.string().datetime(),
      }),
    )
    .min(1)
    .max(500),
});
export type IngestLocationsInput = z.infer<typeof ingestLocationsSchema>;
