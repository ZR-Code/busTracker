import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ingestLocationsSchema, type HealthDto } from '@busbuddy/shared';
import type { AppContext } from '../context';
import { HttpError, parse } from '../lib/errors';
import { safeEqual } from '../lib/tokens';

export function systemRouter(ctx: AppContext): Router {
  const r = Router();

  r.get('/health', async (_req, res) => {
    let database: HealthDto['database'] = 'ok';
    try {
      await ctx.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }
    const body: HealthDto = { status: database === 'ok' ? 'ok' : 'degraded', database, version: '1.0.0', providers: ctx.providers.statuses() };
    res.status(database === 'ok' ? 200 : 503).json(body);
  });

  r.post(
    '/ingest/locations',
    rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false }),
    async (req, res) => {
      const key = ctx.env.GPS_INGEST_API_KEY;
      if (!key) throw new HttpError(503, 'ingest_disabled', 'GPS ingestion is not configured on this server (GPS_INGEST_API_KEY).');
      const provided = req.get('x-api-key') ?? '';
      if (!provided || !safeEqual(provided, key)) throw new HttpError(401, 'unauthorized', 'Invalid API key.');
      const body = parse(ingestLocationsSchema, req.body);
      const buses = await ctx.prisma.bus.findMany({
        where: { dataSource: 'district_gps', busNumber: { in: body.locations.map((l) => l.busNumber) } },
        select: { id: true, busNumber: true },
      });
      const byNumber = new Map(buses.map((b) => [b.busNumber, b.id]));
      const samples = body.locations.flatMap((l) => {
        const busId = byNumber.get(l.busNumber);
        return busId ? [{ busId, lat: l.lat, lng: l.lng, heading: l.heading ?? 0, speedMps: l.speedMps ?? 0, recordedAt: new Date(l.recordedAt) }] : [];
      });
      const accepted = await ctx.providers.district.record(samples);
      res.status(202).json({ accepted, ignored: body.locations.length - samples.length });
    },
  );

  return r;
}
