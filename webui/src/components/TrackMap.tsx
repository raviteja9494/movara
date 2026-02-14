import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export interface MapPoint {
  lat: number;
  lon: number;
  label?: string;
  time?: string;
}

interface TrackMapProps {
  /** Route as ordered positions (oldest first for polyline) */
  positions: MapPoint[];
  /** Show polyline + start/end markers; if false, show one marker per point */
  showRoute?: boolean;
  className?: string;
  height?: string;
}

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const startIcon = L.divIcon({
  className: 'map-marker map-marker-start',
  html: '<div></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const endIcon = L.divIcon({
  className: 'map-marker map-marker-end',
  html: '<div></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export function TrackMap({
  positions,
  showRoute = true,
  className = '',
  height = '360px',
}: TrackMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (positions.length === 0) {
      if (mapRef.current && containerRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
      return;
    }

    if (!containerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        center: [positions[0].lat, positions[0].lon],
        zoom: 14,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
    }

    const layer = layerRef.current;
    if (!layer) return;

    layer.clearLayers();
    const latLngs: L.LatLngExpression[] = positions.map((p) => [p.lat, p.lon]);

    if (showRoute && positions.length >= 2) {
      layer.addLayer(
        L.polyline(latLngs, {
          color: '#2563eb',
          weight: 4,
          opacity: 0.8,
        })
      );
      const first = positions[0];
      const last = positions[positions.length - 1];
      layer.addLayer(
        L.marker([first.lat, first.lon], { icon: startIcon })
          .bindPopup(first.label || first.time || 'Start')
      );
      layer.addLayer(
        L.marker([last.lat, last.lon], { icon: endIcon })
          .bindPopup(last.label || last.time || 'End')
      );
      if (last.label) {
        const nameTag = L.divIcon({
          className: 'map-name-tag',
          html: `<span class="map-name-tag-text">${escapeHtml(last.label)}</span>`,
          iconSize: [120, 24],
          iconAnchor: [60, 20],
        });
        layer.addLayer(L.marker([last.lat, last.lon], { icon: nameTag }));
      }
    } else {
      positions.forEach((p, i) => {
        const marker = L.marker([p.lat, p.lon], { icon: defaultIcon });
        const popup = [p.label, p.time].filter(Boolean).join(' — ') || `Point ${i + 1}`;
        marker.bindPopup(popup);
        if (p.label) {
          marker.bindTooltip(escapeHtml(p.label), {
            permanent: true,
            direction: 'top',
            offset: [0, -24],
            className: 'map-pin-tooltip',
          }).openTooltip();
        }
        layer.addLayer(marker);
      });
    }

    const map = mapRef.current;
    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds.pad(0.15), { maxZoom: 16 });
  }, [positions, showRoute]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      layerRef.current = null;
    };
  }, []);

  if (positions.length === 0) {
    return (
      <div className={`map-placeholder ${className}`} style={{ height }}>
        <span className="muted">No positions to show on map</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`track-map ${className}`}
      style={{ height }}
    />
  );
}
