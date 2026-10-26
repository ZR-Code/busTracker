import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { clientEnv } from '@/lib/env';

function ClickHandler({ onPick }: { onPick: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({ click: (e: L.LeafletMouseEvent) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng) && !map.getBounds().contains([lat, lng])) map.panTo([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

export default function LocationPicker({ lat, lng, onPick }: { lat: number; lng: number; onPick: (p: { lat: number; lng: number }) => void }) {
  const valid = Number.isFinite(lat) && Number.isFinite(lng);
  return (
    <div className="h-72 overflow-hidden rounded-xl border border-border md:h-full md:min-h-72">
      <MapContainer center={valid ? [lat, lng] : [41.748, -88.165]} zoom={16} className="h-full w-full" aria-label="Map: click to place the stop">
        <TileLayer url={clientEnv.tileUrl} attribution={clientEnv.tileAttribution} maxZoom={19} />
        <ClickHandler onPick={onPick} />
        {valid && (
          <>
            <Recenter lat={lat} lng={lng} />
            <CircleMarker center={[lat, lng]} radius={10} pathOptions={{ color: '#16324F', weight: 3, fillColor: '#F59E0B', fillOpacity: 1 }} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
