import type { PrismaClient } from '@prisma/client';
import { DEMO_SCHOOL_ID } from '@busbuddy/shared/demo';
import { logger } from '../lib/logger';
import { generateToken } from '../lib/tokens';

const DEMO_EMAIL_DOMAIN = 'demo.busbuddy.invalid';

interface DemoStudentSpec {
  name: string;
  routeId: string;
  stopId: string;
}

async function createDemoStudent(prisma: PrismaClient, spec: DemoStudentSpec) {
  return prisma.user.create({
    data: {
      name: spec.name,
      role: 'student',
      isDemo: true,
      schoolId: DEMO_SCHOOL_ID,
      email: `student-${generateToken(9).toLowerCase()}@${DEMO_EMAIL_DOMAIN}`,
      settings: { create: { reminderLeadMinutes: 5, remindersEnabled: true } },
      studentProfile: { create: { schoolId: DEMO_SCHOOL_ID, assignedRouteId: spec.routeId, defaultStopId: spec.stopId } },
      stopPreferences: { create: { stopId: spec.stopId, favorite: true, reminderLeadMinutes: 5 } },
    },
  });
}

function sampleNotifications(userId: string) {
  return [
    {
      userId,
      category: 'general' as const,
      title: 'Welcome to the BusBuddy demo',
      body: 'You are exploring a fictional school district. Buses on the map are simulated and labeled DEMO LIVE SIMULATION.',
      eventKey: 'demo:welcome',
      isDemo: true,
      readAt: null,
    },
    {
      userId,
      category: 'route_change' as const,
      title: 'Route 3 detour this week (demo)',
      body: 'Sample announcement: construction near Old Mill Junction may add a few minutes to Route 3.',
      routeId: 'demo-route-3',
      eventKey: 'demo:detour',
      isDemo: true,
      readAt: new Date(),
    },
  ];
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
      const student = await createDemoStudent(this.prisma, { name: 'Jordan Rivera (demo)', routeId: 'demo-route-1', stopId: 'demo-stop-r1-4' });
      await this.prisma.notification.createMany({ data: sampleNotifications(student.id) });
      return { userId: student.id };
    }

    const parent = await this.prisma.user.create({
      data: {
        name: 'Casey Rivera (demo parent)',
        role: 'parent',
        isDemo: true,
        schoolId: DEMO_SCHOOL_ID,
        email: `parent-${generateToken(9).toLowerCase()}@${DEMO_EMAIL_DOMAIN}`,
        settings: { create: { reminderLeadMinutes: 5 } },
      },
    });
    const jordan = await createDemoStudent(this.prisma, { name: 'Jordan Rivera (demo)', routeId: 'demo-route-1', stopId: 'demo-stop-r1-4' });
    const avery = await createDemoStudent(this.prisma, { name: 'Avery Rivera (demo)', routeId: 'demo-route-3', stopId: 'demo-stop-r3-5' });
    const pending = await createDemoStudent(this.prisma, { name: 'Sam Okafor (demo)', routeId: 'demo-route-2', stopId: 'demo-stop-r2-4' });
    const now = new Date();
    await this.prisma.parentStudentRelationship.createMany({
      data: [
        { parentId: parent.id, studentId: jordan.id, status: 'verified', verifiedAt: now },
        { parentId: parent.id, studentId: avery.id, status: 'verified', verifiedAt: now },
        { parentId: parent.id, studentId: pending.id, status: 'pending' },
      ],
    });
    await this.prisma.userStopPreference.createMany({
      data: [
        { userId: parent.id, stopId: 'demo-stop-r1-4', favorite: true, reminderLeadMinutes: 5 },
        { userId: parent.id, stopId: 'demo-stop-r3-5', favorite: true, reminderLeadMinutes: 5 },
      ],
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
