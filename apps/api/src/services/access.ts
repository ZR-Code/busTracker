import type { PrismaClient } from '@prisma/client';
import type { Role } from '@busbuddy/shared';
import { forbidden } from '../lib/errors';

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  schoolId: string | null;
  isDemo: boolean;
}

export type SchoolScope = { all: true } | { all: false; ids: string[] };

export async function resolveSchoolScope(prisma: PrismaClient, user: AuthUser): Promise<SchoolScope> {
  if (user.role === 'admin') return user.schoolId ? { all: false, ids: [user.schoolId] } : { all: true };
  if (user.role === 'student') {
    const profile = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { schoolId: true } });
    const id = profile?.schoolId ?? user.schoolId;
    return { all: false, ids: id ? [id] : [] };
  }
  const links = await prisma.parentStudentRelationship.findMany({
    where: { parentId: user.id, status: 'verified' },
    select: { student: { select: { studentProfile: { select: { schoolId: true } } } } },
  });
  const ids = new Set<string>();
  for (const l of links) if (l.student.studentProfile) ids.add(l.student.studentProfile.schoolId);
  if (user.schoolId) ids.add(user.schoolId);
  return { all: false, ids: [...ids] };
}

export function inScope(scope: SchoolScope, schoolId: string): boolean {
  return scope.all || scope.ids.includes(schoolId);
}

export function scopeWhere(scope: SchoolScope): { schoolId?: { in: string[] } } {
  return scope.all ? {} : { schoolId: { in: scope.ids } };
}

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === 'admin';
}

export function assertAdminCanManage(user: AuthUser, schoolId: string): void {
  if (user.role !== 'admin') throw forbidden('Administrator access required.');
  if (user.schoolId && user.schoolId !== schoolId) throw forbidden('You can only manage your own school.');
}

export async function canAccessStudent(prisma: PrismaClient, user: AuthUser, studentId: string): Promise<boolean> {
  if (user.id === studentId) return true;
  if (user.role === 'parent') {
    const link = await prisma.parentStudentRelationship.findUnique({
      where: { parentId_studentId: { parentId: user.id, studentId } },
      select: { status: true },
    });
    return link?.status === 'verified';
  }
  if (user.role === 'admin') {
    if (!user.schoolId) return true;
    const profile = await prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { schoolId: true } });
    return profile?.schoolId === user.schoolId;
  }
  return false;
}
