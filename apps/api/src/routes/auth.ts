import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { demoSessionSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema, type AuthConfigDto } from '@busbuddy/shared';
import type { AppContext } from '../context';
import { badRequest, conflict, HttpError, parse, unauthorized } from '../lib/errors';
import { logger } from '../lib/logger';
import { generateToken, sha256 } from '../lib/tokens';
import { clearSessionCookie, createSession, destroySession, setSessionCookie } from '../auth/sessions';
import { loadMe } from './me';

const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-0', 4);

export function authRouter(ctx: AppContext): Router {
  const r = Router();
  const { env, prisma } = ctx;
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many attempts. Please wait a few minutes and try again.' } },
  });
  const demoLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: Math.max(30, env.AUTH_RATE_LIMIT_MAX),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many demo sessions from this network. Please try again later.' } },
  });

  const requireLocal = () => {
    if (env.AUTH_PROVIDER !== 'local') throw badRequest('This deployment uses Supabase Auth; sign in through the Supabase client.');
  };

  r.get('/auth/config', (_req, res) => {
    const body: AuthConfigDto = {
      provider: env.AUTH_PROVIDER,
      demoEnabled: env.DEMO_MODE_ENABLED,
      passwordResetDelivery: env.AUTH_PROVIDER === 'supabase' ? 'provider' : 'server_log',
      supabase: env.AUTH_PROVIDER === 'supabase' && env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } : null,
    };
    res.json(body);
  });

  r.get('/auth/session', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ me: req.auth ? await loadMe(ctx, req.auth.user.id) : null });
  });

  r.post('/auth/signup', limiter, async (req, res) => {
    requireLocal();
    const body = parse(signupSchema, req.body);
    const school = await prisma.school.findUnique({ where: { id: body.schoolId }, select: { id: true } });
    if (!school) throw badRequest('Choose a valid school.');
    if (await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } })) {
      throw conflict('An account with this email already exists. Try signing in.');
    }
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        role: body.role,
        schoolId: school.id,
        settings: { create: {} },
        ...(body.role === 'student' ? { studentProfile: { create: { schoolId: school.id } } } : {}),
      },
    });
    const session = await createSession(prisma, user.id, env.SESSION_TTL_HOURS);
    setSessionCookie(res, session.token, session.expiresAt, env.isProduction);
    res.status(201).json(await loadMe(ctx, user.id));
  });

  r.post('/auth/login', limiter, async (req, res) => {
    requireLocal();
    const body = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) throw unauthorized('Email or password is incorrect.');
    const session = await createSession(prisma, user.id, env.SESSION_TTL_HOURS);
    setSessionCookie(res, session.token, session.expiresAt, env.isProduction);
    res.json(await loadMe(ctx, user.id));
  });

  r.post('/auth/logout', async (req, res) => {
    if (req.auth?.sessionToken) await destroySession(prisma, req.auth.sessionToken);
    clearSessionCookie(res, env.isProduction);
    res.status(204).end();
  });

  r.post('/auth/demo', demoLimiter, async (req, res) => {
    if (!env.DEMO_MODE_ENABLED) throw new HttpError(403, 'demo_disabled', 'The interactive demo is disabled on this deployment.');
    if (!(await ctx.demo.demoDataAvailable())) throw new HttpError(503, 'demo_unavailable', 'Demo data has not been seeded. Run `npm run db:seed`.');
    const { persona } = parse(demoSessionSchema, req.body ?? {});
    if (req.auth?.sessionToken) await destroySession(prisma, req.auth.sessionToken);
    const { userId } = await ctx.demo.createPersona(persona);
    const session = await createSession(prisma, userId, env.DEMO_SESSION_TTL_HOURS);
    setSessionCookie(res, session.token, session.expiresAt, env.isProduction);
    ctx.reminders.invalidateSubscriptions();
    res.status(201).json(await loadMe(ctx, userId));
  });

  r.post('/auth/forgot-password', limiter, async (req, res) => {
    requireLocal();
    const { email } = parse(forgotPasswordSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, isDemo: true } });
    if (user?.passwordHash && !user.isDemo) {
      const token = generateToken(32);
      await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
      const link = `${env.WEB_APP_URL}/reset-password?token=${token}`;
      if (env.isProduction) {
        logger.warn('Password reset requested but no email provider is configured; link not delivered.');
      } else {
        logger.info(`Password reset link (development only, valid 30 minutes): ${link}`);
      }
    }
    res.status(202).json({ ok: true });
  });

  r.post('/auth/reset-password', limiter, async (req, res) => {
    requireLocal();
    const { token, password } = parse(resetPasswordSchema, req.body);
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) throw badRequest('This reset link is invalid or has expired. Request a new one.');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId: row.userId } }),
    ]);
    res.json({ ok: true });
  });

  return r;
}
