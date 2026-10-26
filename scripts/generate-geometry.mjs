#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OSRM = 'https://router.project-osrm.org';
const SCHOOL = [41.7482, -88.1652];

const ROUTES = {
  R1: [[41.7712, -88.1842], [41.7698, -88.1752], [41.7681, -88.1655], [41.7642, -88.1583], [41.7601, -88.1678], [41.7553, -88.1718]],
  R2: [[41.7522, -88.1302], [41.7481, -88.1352], [41.7442, -88.1401], [41.7461, -88.1482], [41.7502, -88.1521], [41.7493, -88.1583]],
  R3: [[41.7222, -88.1702], [41.7262, -88.1602], [41.7302, -88.1522], [41.7342, -88.1622], [41.7382, -88.1702], [41.7422, -88.1662]],
  R4: [[41.7452, -88.2052], [41.7502, -88.1982], [41.7462, -88.1902], [41.7412, -88.1852], [41.7442, -88.1782], [41.7472, -88.1722]],
  R5: [[41.7702, -88.1402], [41.7662, -88.1452], [41.7622, -88.1502], [41.7582, -88.1552], [41.7542, -88.1602]],
};

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'BusBuddy-demo-geometry-generator' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function snap([lat, lng]) {
  const data = await getJson(`${OSRM}/nearest/v1/driving/${lng},${lat}?number=1`);
  const wp = data.waypoints[0];
  return { lat: wp.location[1], lng: wp.location[0], street: wp.name || '' };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Math.round(n * 1e6) / 1e6;

const out = { generatedAt: new Date().toISOString(), attribution: 'Route geometry © OpenStreetMap contributors, via OSRM', school: null, routes: {} };
const schoolSnap = await snap(SCHOOL);
out.school = { lat: round(schoolSnap.lat), lng: round(schoolSnap.lng), street: schoolSnap.street };

for (const [id, points] of Object.entries(ROUTES)) {
  const stops = [];
  for (const p of points) {
    stops.push(await snap(p));
    await sleep(300);
  }
  const waypoints = [...stops, schoolSnap].map((s) => `${s.lng},${s.lat}`).join(';');
  const data = await getJson(`${OSRM}/route/v1/driving/${waypoints}?overview=full&geometries=geojson&continue_straight=true`);
  const route = data.routes[0];
  out.routes[id] = {
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    stops: stops.map((s) => ({ lat: round(s.lat), lng: round(s.lng), street: s.street })),
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [round(lat), round(lng)]),
  };
  console.log(id, route.distance.toFixed(0), 'm', route.geometry.coordinates.length, 'points', stops.map((s) => s.street).join(' | '));
  await sleep(500);
}

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'shared', 'src', 'demo', 'geometry.json');
writeFileSync(target, JSON.stringify(out, null, 0) + '\n');
console.log('wrote', target);
