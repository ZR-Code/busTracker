import { PrismaClient, type Role } from '@prisma/client';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createContext, type AppContext } from '../src/context';
import { createSession, SESSION_COOKIE } from '../src/auth/sessions';

let shared: { app: Express; ctx: AppContext; prisma: PrismaClient } | null = null;

export async function testApp() {
  if (shared) return shared;
  const env = loadEnv({ ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env.DATABASE_URL_TEST, AUTH_PROVIDER: 'local', AUTH_RATE_LIMIT_MAX: '1000', GPS_INGEST_API_KEY: 'test-ingest-key-0123456789abcdef' });
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const ctx = createContext(env, prisma, { manualTicks: true });
  await ctx.providers.simulation.start();
  shared = { app: createApp(ctx), ctx, prisma };
  return shared;
}

export async function signedInAs(role: Role, opts: { schoolId?: string | null; routeId?: string; stopId?: string; name?: string } = {}) {
  const { app, prisma } = await testApp();
  const schoolId = opts.schoolId === undefined ? 'demo-school-mvhs' : opts.schoolId;
  const user = await prisma.user.create({
    data: {
      name: opts.name ?? `Test ${role}`,
      role,
      schoolId,
      settings: { create: {} },
      ...(role === 'student' && schoolId ? { studentProfile: { create: { schoolId, assignedRouteId: opts.routeId ?? 'demo-route-1', defaultStopId: opts.stopId ?? 'demo-stop-r1-4' } } } : {}),
    },
  });
  const { token } = await createSession(prisma, user.id, 1);
  const cookie = `${SESSION_COOKIE}=${token}`;
  const agent = {
    get: (url: string) => request(app).get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => request(app).post(url).set('Cookie', cookie).set('X-BusBuddy-Client', 'web').send(body ?? {}),
    put: (url: string, body?: object) => request(app).put(url).set('Cookie', cookie).set('X-BusBuddy-Client', 'web').send(body ?? {}),
    patch: (url: string, body?: object) => request(app).patch(url).set('Cookie', cookie).set('X-BusBuddy-Client', 'web').send(body ?? {}),
    delete: (url: string) => request(app).delete(url).set('Cookie', cookie).set('X-BusBuddy-Client', 'web'),
  };
  return { user, agent };
}
