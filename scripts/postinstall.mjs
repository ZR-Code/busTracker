import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

try {
  createRequire(import.meta.url).resolve('prisma/package.json');
} catch {
  console.log('Prisma CLI not installed; skipping prisma generate.');
  process.exit(0);
}
execSync('prisma generate', { stdio: 'inherit' });
