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
  /** Direction of movement in degrees (0 = north, 90 = east). When set, marker is drawn as an arrow. */
  course?: number;
}

export interface MapStop {
  lat: number;
  lon: number;
  label?: string;
}

interface TrackMapProps {
  /** Route as ordered positions (oldest first for polyline) */
  positions: MapPoint[];
  /** Optional extra markers (e.g. fuel stops, added stops) drawn on top of the route */
  stops?: MapStop[];
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

export function TrackMap({
  positions,
  stops = [],
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
          color: '#1d4ed8',
          weight: 1,
          opacity: 0.85,
        })
      );
      positions.forEach((p, i) => {
        const isFirst = i === 0;
        const isLast = i === positions.length - 1;
        const circle = L.circleMarker([p.lat, p.lon], {
          radius: isFirst || isLast ? 6 : 4,
          fillColor: isFirst ? '#22c55e' : isLast ? '#ef4444' : '#3b82f6',
          color: '#fff',
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.9,
        });
        const gpsLine = `Lat ${p.lat.toFixed(5)}, Lon ${p.lon.toFixed(5)}`;
        const popupLines = [p.label, p.time, gpsLine].filter((x): x is string => Boolean(x));
        const popupHtml = popupLines.length ? `<div class="map-popup">${popupLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>` : escapeHtml(gpsLine);
        const tooltipText = [p.label, p.time, gpsLine].filter(Boolean).join(' · ');
        circle.bindPopup(popupHtml, { className: 'map-popup-container' });
        circle.bindTooltip(tooltipText, {
          direction: 'top',
          opacity: 0.95,
          className: 'map-point-tooltip',
        });
        circle.on('popupopen', () => circle.closeTooltip());
        layer.addLayer(circle);
      });
    } else if (showRoute && positions.length === 1) {
      const p = positions[0];
      const circle = L.circleMarker([p.lat, p.lon], {
        radius: 8,
        fillColor: '#3b82f6',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9,
      });
      const gpsLine = `Lat ${p.lat.toFixed(5)}, Lon ${p.lon.toFixed(5)}`;
      const popupLines = [p.label, p.time, gpsLine].filter((x): x is string => Boolean(x));
      const popupHtml = `<div class="map-popup">${popupLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
      const tooltipText = [p.label, p.time, gpsLine].filter(Boolean).join(' · ');
      circle.bindPopup(popupHtml, { className: 'map-popup-container' });
      circle.bindTooltip(tooltipText, { direction: 'top', opacity: 0.95, className: 'map-point-tooltip' });
      circle.on('popupopen', () => circle.closeTooltip());
      layer.addLayer(circle);
    } else {
      positions.forEach((p) => {
        const hasCourse = typeof p.course === 'number' && !Number.isNaN(p.course);
        const icon = hasCourse
          ? L.divIcon({
              className: 'map-direction-marker',
              html: `<span class="map-direction-arrow" style="transform: rotate(${p.course}deg);" aria-hidden="true"></span>`,
              iconSize: [24, 24],
              iconAnchor: [12, 0], /* tip of arrow at lat/lon */
            })
          : defaultIcon;
        const marker = L.marker([p.lat, p.lon], { icon });
        const gpsLine = `Lat ${p.lat.toFixed(5)}, Lon ${p.lon.toFixed(5)}`;
        const popupLines = [p.label, p.time, gpsLine].filter((x): x is string => Boolean(x));
        const popupHtml = `<div class="map-popup">${popupLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
        const tooltipText = [p.label, p.time, gpsLine].filter(Boolean).join(' · ');
        marker.bindPopup(popupHtml, { className: 'map-popup-container' });
        marker.bindTooltip(tooltipText, { direction: 'top', opacity: 0.95, className: 'map-point-tooltip' });
        layer.addLayer(marker);
      });
    }

    // Optional stop markers (e.g. fuel, added stops)
    stops.forEach((s) => {
      const circle = L.circleMarker([s.lat, s.lon], {
        radius: 6,
        fillColor: '#f59e0b',
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.95,
      });
      const gpsLine = `Lat ${s.lat.toFixed(5)}, Lon ${s.lon.toFixed(5)}`;
      const popupLines = [s.label, gpsLine].filter((x): x is string => Boolean(x));
      const popupHtml = popupLines.length ? `<div class="map-popup">${popupLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>` : escapeHtml(gpsLine);
      circle.bindPopup(popupHtml, { className: 'map-popup-container' });
      circle.bindTooltip(s.label || gpsLine, { direction: 'top', opacity: 0.95, className: 'map-point-tooltip' });
      circle.on('popupopen', () => circle.closeTooltip());
      layer.addLayer(circle);
    });

    const map = mapRef.current;
    const allPoints = latLngs.concat(stops.map((s) => [s.lat, s.lon] as L.LatLngExpression));
    const bounds = L.latLngBounds(allPoints);
    map.fitBounds(bounds.pad(0.2), { maxZoom: 16, animate: false });
  }, [positions, stops, showRoute]);

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
