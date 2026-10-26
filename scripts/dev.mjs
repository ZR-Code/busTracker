#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDatabase, loadEnv, portOpen, ROOT } from './db.mjs';

if (!existsSync(join(ROOT, '.env'))) {
  console.error('No .env file found. Run `npm run setup` first.');
  process.exit(1);
}
loadEnv();

const ports = [
  ['API', Number(process.env.API_PORT ?? 4000)],
  ['web app', 5173],
];
const busy = [];
for (const [name, port] of ports) {
  if ((await portOpen(port, '127.0.0.1')) || (await portOpen(port, '::1'))) busy.push(`${name} (port ${port})`);
}
if (busy.length) {
  console.error(
    `Already in use: ${busy.join(', ')}.\n` +
      'BusBuddy is probably still running in another terminal. Stop it with Ctrl+C there, or find the process with:\n' +
      `  lsof -nP ${ports.map(([, p]) => `-iTCP:${p}`).join(' ')} -sTCP:LISTEN`,
  );
  process.exit(1);
}

const db = await ensureDatabase([process.env.DATABASE_URL]);

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`\n${cmd} ${args.join(' ')} failed.`);
    process.exit(r.status ?? 1);
  }
};
run('npx', ['prisma', 'migrate', 'deploy']);
run('npx', ['tsx', 'prisma/seed.ts']);

const children = [
  spawn('npm', ['run', 'dev', '-w', '@busbuddy/api'], { cwd: ROOT, stdio: 'inherit', env: process.env }),
  spawn('npm', ['run', 'dev', '-w', '@busbuddy/web'], { cwd: ROOT, stdio: 'inherit', env: process.env }),
];

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1500));
  await db.stop();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
for (const c of children) c.on('exit', (code) => !stopping && shutdown(code ?? 1));
