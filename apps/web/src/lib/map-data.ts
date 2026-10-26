import { formatEta, type BusLiveDto, type RouteDetailDto } from '@busbuddy/shared';
import type { MapBus, MapRoute } from '@/components/map/lazy-map';

export function toMapRoute(r: RouteDetailDto): MapRoute {
  return {
    id: r.id,
    name: `Route ${r.number} – ${r.name}`,
    color: r.color,
    geometry: r.geometry,
    stops: r.stops.map((s) => ({ stopId: s.stopId, name: s.name, lat: s.lat, lng: s.lng, description: s.description })),
  };
}

export function toMapBus(live: BusLiveDto, stopId?: string | null): MapBus | null {
  if (!live.location) return null;
  const target = live.stops.find((s) => s.stopId === (stopId ?? live.nextStopId));
  return {
    id: live.bus.id,
    busNumber: live.bus.busNumber,
    lat: live.location.lat,
    lng: live.location.lng,
    heading: live.location.heading,
    status: live.bus.status,
    freshness: live.freshness,
    routeName: live.bus.routeNumber ? `Route ${live.bus.routeNumber} – ${live.bus.routeName}` : null,
    etaText: target && target.etaSeconds !== null && target.state !== 'passed' ? `${target.name}: ${formatEta(target.etaSeconds)}` : null,
  };
}
