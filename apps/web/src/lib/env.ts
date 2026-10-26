const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

export const clientEnv = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1',
  pollIntervalMs: num(import.meta.env.VITE_POLL_INTERVAL_MS as string | undefined, 3000),
  tileUrl: (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution:
    (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) ||
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};
