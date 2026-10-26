import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
// @ts-expect-error untyped script
import { ensureDatabase, loadEnv, ROOT } from '../../../scripts/db.mjs';

export default async function setup() {
  loadEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set (run npm run setup).');
  const handle = await ensureDatabase([url], { log: () => {} });
  const env = { ...process.env, DATABASE_URL: url, SEED_ADMIN_EMAIL: '', SEED_ADMIN_PASSWORD: '' };
  execSync('npx prisma migrate deploy', { cwd: ROOT as string, env, stdio: 'pipe' });
  execSync(`npx tsx ${resolve(ROOT as string, 'prisma/seed.ts')} --reset-simulation`, { cwd: ROOT as string, env, stdio: 'pipe' });
  return async () => {
    await handle.stop();
  };
}
