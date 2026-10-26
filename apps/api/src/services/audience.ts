import type { PrismaClient } from '@prisma/client';

export async function recipientsForRoutes(prisma: PrismaClient, routeIds: string[]): Promise<string[]> {
  if (routeIds.length === 0) return [];
  const [students, prefs] = await Promise.all([
    prisma.studentProfile.findMany({ where: { assignedRouteId: { in: routeIds } }, select: { userId: true } }),
    prisma.userStopPreference.findMany({
      where: { stop: { routes: { some: { routeId: { in: routeIds } } } }, OR: [{ favorite: true }, { reminderLeadMinutes: { not: null } }] },
      select: { userId: true },
    }),
  ]);
  const studentIds = students.map((s) => s.userId);
  const parents = studentIds.length
    ? await prisma.parentStudentRelationship.findMany({ where: { studentId: { in: studentIds }, status: 'verified' }, select: { parentId: true } })
    : [];
  return [...new Set([...studentIds, ...prefs.map((p) => p.userId), ...parents.map((p) => p.parentId)])];
}

export async function recipientsForSchool(prisma: PrismaClient, schoolId: string): Promise<string[]> {
  const [students, prefs] = await Promise.all([
    prisma.studentProfile.findMany({ where: { schoolId }, select: { userId: true } }),
    prisma.userStopPreference.findMany({ where: { stop: { schoolId } }, select: { userId: true } }),
  ]);
  const studentIds = students.map((s) => s.userId);
  const parents = studentIds.length
    ? await prisma.parentStudentRelationship.findMany({ where: { studentId: { in: studentIds }, status: 'verified' }, select: { parentId: true } })
    : [];
  return [...new Set([...studentIds, ...prefs.map((p) => p.userId), ...parents.map((p) => p.parentId)])];
}
