#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './db.mjs';

const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  console.log('.env already exists; leaving it unchanged.');
  process.exit(0);
}

const token = (n) => randomBytes(n).toString('base64url');
const dbPassword = token(18);
const adminPassword = `${token(12)}9a`;
const adminEmail = 'admin@busbuddy.local';

let env = `NODE_ENV=development
API_PORT=4000
ALLOWED_ORIGINS=http://localhost:5173
WEB_APP_URL=http://localhost:5173
AUTH_RATE_LIMIT_MAX=20

DATABASE_URL=postgresql://busbuddy:CHANGE_ME_LOCAL_DB_PASSWORD@localhost:54329/busbuddy
DATABASE_URL_TEST=postgresql://busbuddy:CHANGE_ME_LOCAL_DB_PASSWORD@localhost:54329/busbuddy_test
EMBEDDED_POSTGRES=true

AUTH_PROVIDER=local
SUPABASE_URL=
SUPABASE_ANON_KEY=
SESSION_TTL_HOURS=168
DEMO_MODE_ENABLED=true
DEMO_SESSION_TTL_HOURS=24
ALLOW_SELF_ROUTE_ASSIGNMENT=true

SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
SEED_ADMIN_NAME=Demo Administrator

LOCATION_STALE_SECONDS=90
LOCATION_HISTORY_RETENTION_MINUTES=120

SIMULATION_ENABLED=true
SIMULATION_TICK_MS=1000
SIMULATION_RESTART_DELAY_SECONDS=90

DISTRICT_GPS_BASE_URL=
DISTRICT_GPS_API_KEY=
DISTRICT_GPS_POLL_SECONDS=10
GPS_INGEST_API_KEY=

VITE_API_BASE_URL=/api/v1
VITE_API_PROXY_TARGET=http://localhost:4000
VITE_POLL_INTERVAL_MS=3000
VITE_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_ATTRIBUTION=&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
`;
env = env.replaceAll('CHANGE_ME_LOCAL_DB_PASSWORD', dbPassword);
env = env.replace(/^SEED_ADMIN_EMAIL=.*$/m, `SEED_ADMIN_EMAIL=${adminEmail}`);
env = env.replace(/^SEED_ADMIN_PASSWORD=.*$/m, `SEED_ADMIN_PASSWORD=${adminPassword}`);
writeFileSync(envPath, env, { mode: 0o600 });

console.log(`Created .env with random local secrets.

Local administrator (created when the database is seeded):
  email:    ${adminEmail}
  password: ${adminPassword}

This account exists only in your local database. The password is stored in
.env (git-ignored); change or remove it there before running db:seed if you prefer.

Next: npm run dev`);
