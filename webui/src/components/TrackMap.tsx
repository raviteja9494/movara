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
  /** ISO timestamp for this point (used by "Add stop" in popup when onAddStopAtPoint is set) */
  timestamp?: string;
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
  /** When set, map is clickable; callback receives lat, lon */
  onMapClick?: (lat: number, lon: number) => void;
  /** When set, position popups show "Add stop"; callback receives point (lat, lon, timestamp ISO) */
  onAddStopAtPoint?: (point: { lat: number; lon: number; timestamp: string }) => void;
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
  onMapClick,
  onAddStopAtPoint,
  className = '',
  height = '360px',
}: TrackMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onAddStopAtPointRef = useRef(onAddStopAtPoint);
  onMapClickRef.current = onMapClick;
  onAddStopAtPointRef.current = onAddStopAtPoint;

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
      if (onMapClickRef.current) {
        map.on('click', (e: L.LeafletMouseEvent) => {
          onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
        });
        map.getContainer().style.cursor = 'crosshair';
      }
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
    } else if (mapRef.current) {
      const map = mapRef.current;
      const hadClick = map.listens('click');
      if (onMapClickRef.current && !hadClick) {
        map.on('click', (e: L.LeafletMouseEvent) => {
          onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
        });
        map.getContainer().style.cursor = 'crosshair';
      } else if (!onMapClickRef.current && hadClick) {
        map.off('click');
        map.getContainer().style.cursor = '';
      }
    }

    const layer = layerRef.current;
    if (!layer) return;

    layer.clearLayers();
    const latLngs: L.LatLngExpression[] = positions.map((p) => [p.lat, p.lon]);

    const buildPopupHtml = (p: MapPoint): string => {
      const gpsLine = `Lat ${p.lat.toFixed(5)}, Lon ${p.lon.toFixed(5)}`;
      const popupLines = [p.label, p.time, gpsLine].filter((x): x is string => Boolean(x));
      let html = popupLines.length ? `<div class="map-popup">${popupLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>` : escapeHtml(gpsLine);
      if (p.timestamp && onAddStopAtPointRef.current) {
        html += `<div class="map-popup-actions"><a href="#" role="button" data-add-stop data-lat="${p.lat}" data-lon="${p.lon}" data-timestamp="${escapeHtml(p.timestamp)}">Add stop</a></div>`;
      }
      return html;
    };

    if (showRoute && positions.length >= 2) {
      layer.addLayer(
        L.polyline(latLngs, {
          color: '#1d4ed8',
          weight: 2,
          opacity: 0.85,
        })
      );
      positions.forEach((p, i) => {
        const isFirst = i === 0;
        const isLast = i === positions.length - 1;
        const hasCourse = typeof p.course === 'number' && !Number.isNaN(p.course);
        const color = isFirst ? '#22c55e' : isLast ? '#ef4444' : '#3b82f6';
        if (hasCourse) {
          const icon = L.divIcon({
            className: 'map-direction-marker map-route-arrow',
            html: `<span class="map-direction-arrow map-route-arrow-shape" style="transform: rotate(${p.course}deg); border-bottom-color: ${color};" aria-hidden="true"></span>`,
            iconSize: [14, 14],
            iconAnchor: [7, 0],
          });
          const marker = L.marker([p.lat, p.lon], { icon });
          marker.bindPopup(buildPopupHtml(p), { className: 'map-popup-container' });
          layer.addLayer(marker);
        } else {
          const circle = L.circleMarker([p.lat, p.lon], {
            radius: isFirst || isLast ? 6 : 4,
            fillColor: color,
            color: '#fff',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.9,
          });
          circle.bindPopup(buildPopupHtml(p), { className: 'map-popup-container' });
          layer.addLayer(circle);
        }
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
      circle.bindPopup(buildPopupHtml(p), { className: 'map-popup-container' });
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
        marker.bindPopup(buildPopupHtml(p), { className: 'map-popup-container' });
        layer.addLayer(marker);
      });
    }

    // Optional stop markers (e.g. fuel, added stops) – use marker + divIcon so they draw above route arrows (markerPane)
    stops.forEach((s) => {
      const icon = L.divIcon({
        className: 'map-stop-marker',
        html: '<span class="map-stop-dot" aria-hidden="true"></span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([s.lat, s.lon], { icon });
      const gpsLine = `Lat ${s.lat.toFixed(5)}, Lon ${s.lon.toFixed(5)}`;
      const popupLines = [s.label, gpsLine].filter((x): x is string => Boolean(x));
      const popupHtml = popupLines.length ? `<div class="map-popup">${popupLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>` : escapeHtml(gpsLine);
      marker.bindPopup(popupHtml, { className: 'map-popup-container' });
      layer.addLayer(marker);
    });

    const map = mapRef.current;
    const allPoints = latLngs.concat(stops.map((s) => [s.lat, s.lon] as L.LatLngExpression));
    const bounds = L.latLngBounds(allPoints);
    map.fitBounds(bounds.pad(0.2), { maxZoom: 16, animate: false });
  }, [positions, stops, showRoute, onAddStopAtPoint]);

  useEffect(() => {
    if (!onAddStopAtPoint) return;
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    const handler = (e: MouseEvent) => {
      const el = (e.target as Element).closest('[data-add-stop]');
      if (!el) return;
      e.preventDefault();
      const lat = parseFloat(el.getAttribute('data-lat')!);
      const lon = parseFloat(el.getAttribute('data-lon')!);
      const timestamp = el.getAttribute('data-timestamp')!;
      if (Number.isFinite(lat) && Number.isFinite(lon) && timestamp) {
        onAddStopAtPointRef.current?.({ lat, lon, timestamp });
        map.closePopup();
      }
    };
    container.addEventListener('click', handler);
    return () => container.removeEventListener('click', handler);
  }, [onAddStopAtPoint]);

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
