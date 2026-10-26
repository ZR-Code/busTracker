import type { PrismaClient } from '@prisma/client';
import type { CookieOptions, Response } from 'express';
import { generateToken, sha256 } from '../lib/tokens';

export const SESSION_COOKIE = 'bb_session';

export function sessionCookieOptions(isProduction: boolean, maxAgeMs: number): CookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

export async function createSession(prisma: PrismaClient, userId: string, ttlHours: number): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
  await prisma.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  return { token, expiresAt };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date, isProduction: boolean): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(isProduction, expiresAt.getTime() - Date.now()));
}

export function clearSessionCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(isProduction, 0), maxAge: undefined });
}

export async function resolveSession(prisma: PrismaClient, token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, name: true, email: true, role: true, schoolId: true, isDemo: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session;
}

export async function destroySession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}
