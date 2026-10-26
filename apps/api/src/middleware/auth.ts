import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@busbuddy/shared';
import { forbidden, HttpError, unauthorized } from '../lib/errors';
import { resolveSchoolScope, type AuthUser, type SchoolScope } from '../services/access';
import { resolveSession, SESSION_COOKIE } from '../auth/sessions';
import type { AppContext } from '../context';

export interface AuthContext {
  user: AuthUser;
  sessionToken: string | null;
  scope: () => Promise<SchoolScope>;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export function authenticate(ctx: AppContext): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      let user: AuthUser | null = null;
      let sessionToken: string | null = null;
      const cookieToken = typeof req.cookies?.[SESSION_COOKIE] === 'string' ? (req.cookies[SESSION_COOKIE] as string) : null;
      const header = req.headers.authorization;
      const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;

      if (cookieToken) {
        const session = await resolveSession(ctx.prisma, cookieToken);
        if (session) {
          user = session.user;
          sessionToken = cookieToken;
        }
      }
      if (!user && bearer && ctx.supabase) {
        user = await ctx.supabase.verify(bearer);
      }
      if (user) {
        let cached: Promise<SchoolScope> | null = null;
        const u = user;
        req.auth = { user: u, sessionToken, scope: () => (cached ??= resolveSchoolScope(ctx.prisma, u)) };
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.user.role)) return next(forbidden(roles.includes('admin') && roles.length === 1 ? 'Administrator access required.' : undefined));
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.auth) throw unauthorized();
  return req.auth.user;
}

export function scopeOf(req: Request): Promise<SchoolScope> {
  if (!req.auth) throw unauthorized();
  return req.auth.scope();
}

export const requireClientHeader: RequestHandler = (req, _res, next) => {
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (safe || req.path.startsWith('/ingest/')) return next();
  if (req.get('x-busbuddy-client') !== 'web') {
    return next(new HttpError(403, 'csrf_check_failed', 'Missing X-BusBuddy-Client header.'));
  }
  next();
};
