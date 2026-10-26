#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(file = join(ROOT, '.env')) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}

function isLocal(url) {
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

export function portOpen(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((done) => {
    const socket = net.connect({ port, host });
    const finish = (ok) => {
      socket.destroy();
      done(ok);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

export async function ensureDatabase(databaseUrls, { log = console.log } = {}) {
  const urls = databaseUrls.filter(Boolean).map((u) => new URL(u));
  if (urls.length === 0) throw new Error('DATABASE_URL is not set. Run `npm run setup` first.');
  const primary = urls[0];
  if (!isLocal(primary)) {
    log(`[db] Using remote database at ${primary.hostname}`);
    return { stop: async () => {}, started: false };
  }
  const port = Number(primary.port || 5432);
  let server = null;
  if (await portOpen(port)) {
    log(`[db] PostgreSQL already listening on port ${port}`);
  } else {
    if (process.env.EMBEDDED_POSTGRES === 'false') {
      throw new Error(`Nothing is listening on localhost:${port} and EMBEDDED_POSTGRES=false. Start PostgreSQL or update DATABASE_URL.`);
    }
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const databaseDir = join(ROOT, '.data', 'postgres');
    mkdirSync(dirname(databaseDir), { recursive: true });
    server = new EmbeddedPostgres({
      databaseDir,
      user: decodeURIComponent(primary.username),
      password: decodeURIComponent(primary.password),
      port,
      persistent: true,
      onLog: () => {},
      onError: (e) => log(`[db] ${String(e).trim()}`),
    });
    if (!existsSync(join(databaseDir, 'PG_VERSION'))) {
      log('[db] Initializing project-local PostgreSQL in .data/postgres (first run)…');
      await server.initialise();
    }
    log(`[db] Starting project-local PostgreSQL on port ${port}…`);
    await server.start();
  }

  const { default: pg } = await import('pg');
  const admin = new URL(primary);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    for (const u of urls) {
      const name = u.pathname.replace(/^\//, '');
      if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Unsupported database name: ${name}`);
      const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      if (!rowCount) {
        await client.query(`CREATE DATABASE "${name}"`);
        log(`[db] Created database ${name}`);
      }
    }
  } finally {
    await client.end();
  }
  return {
    started: server !== null,
    stop: async () => {
      if (server) await server.stop();
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  loadEnv();
  const handle = await ensureDatabase([process.env.DATABASE_URL]);
  if (!handle.started) {
    console.log('[db] Nothing to do; leaving the existing server running.');
    process.exit(0);
  }
  console.log('[db] Ready. Press Ctrl+C to stop.');
  const shutdown = async () => {
    await handle.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  setInterval(() => {}, 1 << 30);
}
