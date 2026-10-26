import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { describeDisabledFeatures, loadEnv } from './config/env';
import { createContext, startBackgroundJobs } from './context';
import { logger } from './lib/logger';

async function main() {
  const env = loadEnv();
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    throw new Error(`Cannot reach the database at DATABASE_URL. Start it with \`npm run db:start\` (or \`npm run dev\`).\n${e instanceof Error ? e.message : String(e)}`);
  }
  const ctx = createContext(env, prisma);
  const stopJobs = await startBackgroundJobs(ctx);
  const app = createApp(ctx);
  const server = app.listen(env.API_PORT, () => {
    logger.info(`BusBuddy API listening on http://localhost:${env.API_PORT}/api/v1`);
    for (const note of describeDisabledFeatures(env)) logger.info(note);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}; shutting down`);
    server.close();
    await stopJobs();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  logger.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
