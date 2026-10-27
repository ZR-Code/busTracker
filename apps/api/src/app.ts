import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { AppContext } from './context';
import { errorHandler, notFoundHandler } from './lib/errors';
import { authenticate, requireClientHeader } from './middleware/auth';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { busesRouter } from './routes/buses';
import { catalogRouter } from './routes/catalog';
import { meRouter } from './routes/me';
import { notificationsRouter } from './routes/notifications';
import { systemRouter } from './routes/system';

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', ctx.env.TRUST_PROXY);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || ctx.env.allowedOrigins.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-BusBuddy-Client'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, limit: 900, standardHeaders: 'draft-7', legacyHeaders: false }));
  api.use(requireClientHeader);
  api.use(authenticate(ctx));
  api.use(systemRouter(ctx));
  api.use(authRouter(ctx));
  api.use(meRouter(ctx));
  api.use(catalogRouter(ctx));
  api.use(busesRouter(ctx));
  api.use(notificationsRouter(ctx));
  api.use(adminRouter(ctx));

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
