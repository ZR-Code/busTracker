import type { PrismaClient } from '@prisma/client';
import { DEMO_PERSONAS, DEMO_REMINDER_LEAD_MINUTES, DEMO_SAMPLE_NOTIFICATIONS, DEMO_SCHOOL_ID, type DemoStudentSpec } from '@busbuddy/shared/demo';
import { logger } from '../lib/logger';
import { generateToken } from '../lib/tokens';

const DEMO_EMAIL_DOMAIN = 'demo.busbuddy.invalid';

async function createDemoStudent(prisma: PrismaClient, spec: DemoStudentSpec) {
  return prisma.user.create({
    data: {
      name: spec.name,
      role: 'student',
      isDemo: true,
      schoolId: DEMO_SCHOOL_ID,
      email: `student-${generateToken(9).toLowerCase()}@${DEMO_EMAIL_DOMAIN}`,
      settings: { create: { reminderLeadMinutes: DEMO_REMINDER_LEAD_MINUTES, remindersEnabled: true } },
      studentProfile: { create: { schoolId: DEMO_SCHOOL_ID, assignedRouteId: spec.routeId, defaultStopId: spec.stopId } },
      stopPreferences: { create: { stopId: spec.stopId, favorite: true, reminderLeadMinutes: DEMO_REMINDER_LEAD_MINUTES } },
    },
  });
}

function sampleNotifications(userId: string) {
  return DEMO_SAMPLE_NOTIFICATIONS.map(({ read, routeId, ...n }) => ({ userId, ...n, ...(routeId ? { routeId } : {}), isDemo: true, readAt: read ? new Date() : null }));
}

export class DemoService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: { ttlHours: number },
  ) {}

  async demoDataAvailable(): Promise<boolean> {
    return (await this.prisma.route.count({ where: { schoolId: DEMO_SCHOOL_ID } })) > 0;
  }

  async createPersona(persona: 'student' | 'parent'): Promise<{ userId: string }> {
    if (persona === 'student') {
      const student = await createDemoStudent(this.prisma, DEMO_PERSONAS.student);
      await this.prisma.notification.createMany({ data: sampleNotifications(student.id) });
      return { userId: student.id };
    }

    const parent = await this.prisma.user.create({
      data: {
        name: DEMO_PERSONAS.parent.name,
        role: 'parent',
        isDemo: true,
        schoolId: DEMO_SCHOOL_ID,
        email: `parent-${generateToken(9).toLowerCase()}@${DEMO_EMAIL_DOMAIN}`,
        settings: { create: { reminderLeadMinutes: DEMO_REMINDER_LEAD_MINUTES } },
      },
    });
    const [jordanSpec, averySpec] = DEMO_PERSONAS.parent.verifiedStudents;
    const jordan = await createDemoStudent(this.prisma, jordanSpec);
    const avery = await createDemoStudent(this.prisma, averySpec);
    const pending = await createDemoStudent(this.prisma, DEMO_PERSONAS.parent.pendingStudent);
    const now = new Date();
    await this.prisma.parentStudentRelationship.createMany({
      data: [
        { parentId: parent.id, studentId: jordan.id, status: 'verified', verifiedAt: now },
        { parentId: parent.id, studentId: avery.id, status: 'verified', verifiedAt: now },
        { parentId: parent.id, studentId: pending.id, status: 'pending' },
      ],
    });
    await this.prisma.userStopPreference.createMany({
      data: DEMO_PERSONAS.parent.favoriteStopIds.map((stopId) => ({ userId: parent.id, stopId, favorite: true, reminderLeadMinutes: DEMO_REMINDER_LEAD_MINUTES })),
    });
    await this.prisma.notification.createMany({ data: sampleNotifications(parent.id) });
    return { userId: parent.id };
  }

  async cleanup(): Promise<number> {
    const cutoff = new Date(Date.now() - this.opts.ttlHours * 3_600_000);
    const res = await this.prisma.user.deleteMany({ where: { isDemo: true, createdAt: { lt: cutoff } } });
    if (res.count) logger.info('Removed expired demo accounts', { count: res.count });
    return res.count;
  }
}
