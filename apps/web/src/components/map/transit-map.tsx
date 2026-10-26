import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bus as BusIcon, Crosshair, MapPin, Maximize2, MapPinOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { boundsOf, BUS_STATUS_LABELS, FRESHNESS_LABELS, type BusStatus, type LatLngTuple, type LocationFreshness } from '@busbuddy/shared';
import { clientEnv } from '@/lib/env';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion';

export interface MapStop {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
}

export interface MapRoute {
  id: string;
  name: string;
  color: string;
  geometry: LatLngTuple[];
  stops: MapStop[];
}

export interface MapBus {
  id: string;
  busNumber: string;
  lat: number;
  lng: number;
  heading: number;
  status: BusStatus;
  freshness: LocationFreshness;
  routeName?: string | null;
  etaText?: string | null;
}

export interface TransitMapProps {
  routes: MapRoute[];
  buses: MapBus[];
  selectedStopId?: string | null;
  highlightStopIds?: string[];
  onSelectStop?: (stopId: string) => void;
  selectedBusId?: string | null;
  onSelectBus?: (busId: string) => void;
  school?: { lat: number; lng: number; name: string } | null;
  className?: string;
  ariaLabel: string;
  showLegend?: boolean;
  linkBuses?: boolean;
}

const DEFAULT_CENTER: LatLngTuple = [41.748, -88.165];

function busIconHtml(number: string, selected: boolean, inactive: boolean, simulated: boolean): string {
  const fill = inactive ? '#64748b' : selected ? '#16324F' : '#2878E5';
  return `
    <div class="bb-bus" style="position:relative;width:44px;height:44px">
      <svg data-arrow viewBox="0 0 44 44" width="44" height="44" style="position:absolute;inset:0;transform:rotate(0deg);transform-origin:50% 50%">
        <path d="M22 2 L28 11 L16 11 Z" fill="${fill}" opacity="${inactive ? 0 : 0.95}"/>
      </svg>
      <div style="position:absolute;left:7px;top:7px;width:30px;height:30px;border-radius:9px;background:${fill};border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px/1 Inter Variable, system-ui, sans-serif">${number}</div>
      ${simulated ? '<div style="position:absolute;right:0;top:2px;width:12px;height:12px;border-radius:999px;background:#7c3aed;border:2px solid #fff" title="Simulated"></div>' : ''}
    </div>`;
}

function AnimatedBusMarker({ bus, selected, onSelect, linkBuses }: { bus: MapBus; selected: boolean; onSelect?: (id: string) => void; linkBuses?: boolean }) {
  const markerRef = useRef<L.Marker | null>(null);
  const current = useRef<LatLngTuple>([bus.lat, bus.lng]);
  const reduced = usePrefersReducedMotion();
  const inactive = bus.status === 'out_of_service' || bus.freshness === 'stale';
  const icon = useMemo(
    () => L.divIcon({ className: 'bb-bus-icon', html: busIconHtml(bus.busNumber, selected, inactive, bus.freshness === 'simulated'), iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -18] }),
    [bus.busNumber, selected, inactive, bus.freshness],
  );

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const from = current.current;
    const to: LatLngTuple = [bus.lat, bus.lng];
    const jump = Math.abs(from[0] - to[0]) > 0.01 || Math.abs(from[1] - to[1]) > 0.01;
    if (reduced || jump) {
      marker.setLatLng(to);
      current.current = to;
      return;
    }
    const duration = Math.min(clientEnv.pollIntervalMs, 2800);
    const start = performance.now();
    let frame = 0;
    const stepFn = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const pos: LatLngTuple = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
      marker.setLatLng(pos);
      current.current = pos;
      if (k < 1) frame = requestAnimationFrame(stepFn);
    };
    frame = requestAnimationFrame(stepFn);
    return () => cancelAnimationFrame(frame);
  }, [bus.lat, bus.lng, reduced]);

  useEffect(() => {
    const el = markerRef.current?.getElement()?.querySelector<SVGElement>('[data-arrow]');
    if (el) el.style.transform = `rotate(${bus.heading}deg)`;
  }, [bus.heading, icon]);

  return (
    <Marker
      ref={markerRef}
      position={current.current}
      icon={icon}
      keyboard
      title={`Bus ${bus.busNumber}: ${BUS_STATUS_LABELS[bus.status]}`}
      alt={`Bus ${bus.busNumber}`}
      zIndexOffset={selected ? 1000 : 500}
      eventHandlers={{ click: () => onSelect?.(bus.id) }}
    >
      <Popup>
        <div className="min-w-44 space-y-1">
          <p className="text-sm font-bold">Bus {bus.busNumber}</p>
          {bus.routeName && <p className="text-xs text-muted">{bus.routeName}</p>}
          <p className="text-xs">{BUS_STATUS_LABELS[bus.status]}</p>
          {bus.etaText && <p className="text-xs font-semibold">{bus.etaText}</p>}
          <p className={cn('text-[11px] font-bold uppercase tracking-wide', bus.freshness === 'simulated' ? 'text-demo' : bus.freshness === 'stale' ? 'text-warning-text' : 'text-muted')}>
            {FRESHNESS_LABELS[bus.freshness]}
          </p>
          {linkBuses && (
            <Link to={`/track/${bus.id}`} className="inline-block pt-1 text-xs font-semibold text-brand-strong underline">
              Track this bus
            </Link>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

type TileState = 'loading' | 'ready' | 'error';

export default function TransitMap({
  routes,
  buses,
  selectedStopId,
  highlightStopIds = [],
  onSelectStop,
  selectedBusId,
  onSelectBus,
  school,
  className,
  ariaLabel,
  showLegend = true,
  linkBuses,
}: TransitMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [tiles, setTiles] = useState<TileState>('loading');
  const errors = useRef(0);

  const allPoints = useMemo(() => routes.flatMap((r) => (r.geometry.length ? r.geometry : r.stops.map((s) => [s.lat, s.lng] as LatLngTuple))), [routes]);
  const fitKey = routes.map((r) => r.id).join('|');
  const stops = useMemo(() => {
    const m = new Map<string, MapStop>();
    for (const r of routes) for (const s of r.stops) if (!m.has(s.stopId)) m.set(s.stopId, s);
    return [...m.values()];
  }, [routes]);
  const selectedStop = stops.find((s) => s.stopId === selectedStopId) ?? null;
  const focusBus = buses.find((b) => b.id === selectedBusId) ?? buses[0] ?? null;

  const fit = () => {
    const b = boundsOf(allPoints);
    if (b && mapRef.current) mapRef.current.fitBounds(b, { padding: [28, 28], maxZoom: 16 });
  };

  useEffect(() => {
    const t = setTimeout(fit, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const flyTo = (lat: number, lng: number) => mapRef.current?.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 16), { duration: 0.6 });

  const isSchool = (s: MapStop) => school && Math.abs(s.lat - school.lat) < 1e-5 && Math.abs(s.lng - school.lng) < 1e-5;

  return (
    <div role="region" aria-label={ariaLabel} className={cn('relative isolate overflow-hidden rounded-2xl border border-border bg-surface-muted', className)}>
      <MapContainer
        ref={mapRef}
        center={allPoints[0] ?? DEFAULT_CENTER}
        zoom={14}
        className="h-full w-full"
        scrollWheelZoom
        attributionControl
      >
        <TileLayer
          url={clientEnv.tileUrl}
          attribution={clientEnv.tileAttribution}
          maxZoom={19}
          eventHandlers={{
            tileload: () => setTiles('ready'),
            tileerror: () => {
              errors.current += 1;
              setTiles((t) => (t === 'ready' ? t : errors.current > 3 ? 'error' : t));
            },
          }}
        />
        {routes.map((r) =>
          r.geometry.length > 1 ? (
            <Polyline key={`${r.id}-casing`} positions={r.geometry} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.85 }} interactive={false} />
          ) : null,
        )}
        {routes.map((r) => (r.geometry.length > 1 ? <Polyline key={r.id} positions={r.geometry} pathOptions={{ color: r.color, weight: 5, opacity: 0.9 }} interactive={false} /> : null))}
        {stops.map((s) => {
          const selected = s.stopId === selectedStopId;
          const highlighted = highlightStopIds.includes(s.stopId);
          const schoolStop = isSchool(s);
          return (
            <CircleMarker
              key={s.stopId}
              center={[s.lat, s.lng]}
              radius={selected ? 10 : schoolStop ? 8 : 6}
              pathOptions={{
                color: selected ? '#16324F' : '#ffffff',
                weight: selected ? 3 : 2,
                fillColor: selected ? '#F59E0B' : schoolStop ? '#16A34A' : highlighted ? '#2878E5' : '#16324F',
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSelectStop?.(s.stopId) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {s.name}
                {selected ? ' (selected)' : ''}
              </Tooltip>
            </CircleMarker>
          );
        })}
        {buses.map((b) => (
          <AnimatedBusMarker key={b.id} bus={b} selected={b.id === selectedBusId} onSelect={onSelectBus} linkBuses={linkBuses} />
        ))}
      </MapContainer>

      <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
        <MapButton label="Fit route to view" onClick={fit}>
          <Maximize2 className="h-4 w-4" aria-hidden />
        </MapButton>
        {focusBus && (
          <MapButton label={`Center on bus ${focusBus.busNumber}`} onClick={() => flyTo(focusBus.lat, focusBus.lng)}>
            <Crosshair className="h-4 w-4" aria-hidden />
          </MapButton>
        )}
        {selectedStop && (
          <MapButton label={`Center on ${selectedStop.name}`} onClick={() => flyTo(selectedStop.lat, selectedStop.lng)}>
            <MapPin className="h-4 w-4" aria-hidden />
          </MapButton>
        )}
      </div>

      {showLegend && (
        <div className="absolute bottom-6 left-3 z-[500] rounded-xl border border-border bg-surface/95 px-3 py-2 text-xs shadow-sm backdrop-blur" aria-label="Map legend">
          <p className="mb-1 font-semibold">Legend</p>
          <ul className="space-y-1">
            <li className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-brand text-white" aria-hidden>
                <BusIcon className="h-3 w-3" />
              </span>
              Bus
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-[#16324F] bg-[#F59E0B]" aria-hidden />
              Selected stop
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-white bg-[#16324F] ring-1 ring-border" aria-hidden />
              Stop
            </li>
            {school && (
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border-2 border-white bg-[#16A34A] ring-1 ring-border" aria-hidden />
                School
              </li>
            )}
            {buses.some((b) => b.freshness === 'simulated') && (
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border-2 border-white bg-[#7c3aed] ring-1 ring-border" aria-hidden />
                Simulated position
              </li>
            )}
          </ul>
        </div>
      )}

      {tiles !== 'ready' && (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
          <div role="status" className="pointer-events-auto mx-4 flex max-w-xs items-center gap-2 rounded-xl border border-border bg-surface/95 px-4 py-3 text-sm shadow">
            {tiles === 'loading' ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden /> Loading map…
              </>
            ) : (
              <>
                <MapPinOff className="h-4 w-4 shrink-0 text-warning-text" aria-hidden />
                Map tiles couldn’t load. Bus positions are still drawn, and stop details are listed beside the map.
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-text shadow-sm hover:bg-surface-muted"
    >
      {children}
    </button>
  );
}
