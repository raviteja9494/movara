import { useEffect, useMemo, useRef } from 'react';
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
  /** Optional speed at this point in km/h */
  speed?: number | null;
  /** ISO timestamp for this point (used by "Add stop" in popup when onAddStopAtPoint is set) */
  timestamp?: string;
}

export interface MapStop {
  lat: number;
  lon: number;
  label?: string;
}

export interface MapBookmark {
  lat: number;
  lon: number;
  label?: string;
  notes?: string;
}

interface TrackMapProps {
  /** Route as ordered positions (oldest first for polyline) */
  positions: MapPoint[];
  /** Optional extra markers (e.g. fuel stops, added stops) drawn on top of the route */
  stops?: MapStop[];
  /** Optional saved/bookmarked locations shown as a distinct layer */
  bookmarks?: MapBookmark[];
  /** Show polyline + start/end markers; if false, show one marker per point */
  showRoute?: boolean;
  /** When set, map is clickable; callback receives lat, lon */
  onMapClick?: (lat: number, lon: number) => void;
  /** When set, position popups show "Add stop"; callback receives point (lat, lon, timestamp ISO) */
  onAddStopAtPoint?: (point: { lat: number; lon: number; timestamp: string }) => void;
  className?: string;
  height?: string;
}

type SpeedBand = {
  minKmh: number;
  maxKmh: number;
  color: string;
  label: string;
};

const SPEED_BANDS: SpeedBand[] = [
  { minKmh: 0, maxKmh: 5, color: '#94a3b8', label: '0-5 km/h' },
  { minKmh: 5, maxKmh: 25, color: '#22c55e', label: '5-25 km/h' },
  { minKmh: 25, maxKmh: 50, color: '#eab308', label: '25-50 km/h' },
  { minKmh: 50, maxKmh: 80, color: '#f97316', label: '50-80 km/h' },
  { minKmh: 80, maxKmh: Number.POSITIVE_INFINITY, color: '#ef4444', label: '80+ km/h' },
];

function getSpeedBand(speedKmh: number | null): SpeedBand | null {
  if (speedKmh == null || !Number.isFinite(speedKmh) || speedKmh < 0) return null;
  return SPEED_BANDS.find((band) => speedKmh >= band.minKmh && speedKmh < band.maxKmh) ?? SPEED_BANDS[SPEED_BANDS.length - 1] ?? null;
}

function deriveSegmentSpeedKmh(from: MapPoint, to: MapPoint): number | null {
  const speeds = [from.speed, to.speed].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (speeds.length === 2) return (speeds[0] + speeds[1]) / 2;
  if (speeds.length === 1) return speeds[0];
  if (!from.timestamp || !to.timestamp) return null;

  const deltaMs = new Date(to.timestamp).getTime() - new Date(from.timestamp).getTime();
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 10 * 60 * 1000) return null;

  const meters = haversineMeters(from.lat, from.lon, to.lat, to.lon);
  const kmh = (meters / deltaMs) * 3600;
  if (!Number.isFinite(kmh) || kmh < 0 || kmh > 180) return null;
  return kmh;
}

function buildSpeedSegments(points: MapPoint[]): Array<{ latLngs: L.LatLngExpression[]; band: SpeedBand }> {
  const segments: Array<{ latLngs: L.LatLngExpression[]; band: SpeedBand }> = [];
  let pending: { latLngs: L.LatLngExpression[]; band: SpeedBand } | null = null;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const speedBand = getSpeedBand(deriveSegmentSpeedKmh(from, to));
    if (!speedBand) continue;

    const start: L.LatLngExpression = [from.lat, from.lon];
    const end: L.LatLngExpression = [to.lat, to.lon];
    if (pending && pending.band.label === speedBand.label) {
      pending.latLngs.push(end);
      continue;
    }

    if (pending) segments.push(pending);
    pending = { latLngs: [start, end], band: speedBand };
  }

  if (pending) segments.push(pending);
  return segments;
}

function findNearestPoint(points: MapPoint[], lat: number, lon: number): MapPoint | null {
  if (points.length === 0) return null;
  let best = points[0] ?? null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const latDelta = point.lat - lat;
    const lonDelta = (point.lon - lon) * Math.cos((lat * Math.PI) / 180);
    const score = latDelta * latDelta + lonDelta * lonDelta;
    if (score < bestScore) {
      bestScore = score;
      best = point;
    }
  }
  return best;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface MarkerCluster {
  lat: number;
  lon: number;
  points: MapPoint[];
}

function clusterNearbyPoints(points: MapPoint[]): MarkerCluster[] {
  const remaining = [...points];
  const clusters: MarkerCluster[] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const grouped = [seed];
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const point = remaining[i]!;
      const latDelta = Math.abs(point.lat - seed.lat);
      const lonDelta = Math.abs(point.lon - seed.lon);
      if (latDelta <= 0.00025 && lonDelta <= 0.00025) {
        grouped.push(point);
        remaining.splice(i, 1);
      }
    }

    const lat = grouped.reduce((sum, point) => sum + point.lat, 0) / grouped.length;
    const lon = grouped.reduce((sum, point) => sum + point.lon, 0) / grouped.length;
    clusters.push({ lat, lon, points: grouped });
  }

  return clusters;
}

function bindRouteStopPicker(
  line: L.Polyline,
  positions: MapPoint[],
  onAddStopAtPointRef: React.MutableRefObject<TrackMapProps['onAddStopAtPoint']>,
) {
  const handleSelect = (e: L.LeafletEvent & { latlng?: L.LatLng }) => {
    if (!e.latlng) return;
    const nearest = findNearestPoint(positions, e.latlng.lat, e.latlng.lng);
    if (!nearest?.timestamp) return;
    onAddStopAtPointRef.current?.({
      lat: nearest.lat,
      lon: nearest.lon,
      timestamp: nearest.timestamp,
    });
  };

  line.on('click', handleSelect);
  line.on('touchstart', handleSelect);
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
  bookmarks = [],
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
  const speedSegments = useMemo(
    () => showRoute ? buildSpeedSegments(positions) : [],
    [positions, showRoute],
  );
  const showSpeedLegend = speedSegments.length > 0;

  useEffect(() => {
    const hasAnyMapData = positions.length > 0 || stops.length > 0 || bookmarks.length > 0;
    if (!hasAnyMapData) {
      if (mapRef.current && containerRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
      return;
    }

    if (!containerRef.current) return;

    const fallbackCenter: L.LatLngTuple = positions[0]
      ? [positions[0].lat, positions[0].lon]
      : bookmarks[0]
        ? [bookmarks[0].lat, bookmarks[0].lon]
        : [stops[0].lat, stops[0].lon];

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        center: fallbackCenter,
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
      const routeTapTarget = L.polyline(latLngs, {
        color: '#1d4ed8',
        weight: 18,
        opacity: 0.01,
      });
      if (onAddStopAtPointRef.current) {
        bindRouteStopPicker(routeTapTarget, positions, onAddStopAtPointRef);
        layer.addLayer(routeTapTarget);
      }

      if (speedSegments.length > 0) {
        speedSegments.forEach((segment) => {
          layer.addLayer(L.polyline(segment.latLngs, {
            color: segment.band.color,
            weight: 5,
            opacity: 0.92,
            lineCap: 'round',
            lineJoin: 'round',
          }));
        });
      } else {
        const routeLine = L.polyline(latLngs, {
          color: '#1d4ed8',
          weight: 4,
          opacity: 0.85,
        });
        if (onAddStopAtPointRef.current) {
          bindRouteStopPicker(routeLine, positions, onAddStopAtPointRef);
        }
        layer.addLayer(routeLine);
      }

      const firstPoint = positions[0];
      const lastPoint = positions[positions.length - 1];
      const startCircle = L.circleMarker([firstPoint.lat, firstPoint.lon], {
        radius: 6,
        fillColor: '#22c55e',
        color: '#fff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.95,
      });
      startCircle.bindPopup(buildPopupHtml(firstPoint), { className: 'map-popup-container' });
      layer.addLayer(startCircle);

      const endCircle = L.circleMarker([lastPoint.lat, lastPoint.lon], {
        radius: 6,
        fillColor: '#ef4444',
        color: '#fff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.95,
      });
      endCircle.bindPopup(buildPopupHtml(lastPoint), { className: 'map-popup-container' });
      layer.addLayer(endCircle);
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
      const clusters = clusterNearbyPoints(positions);
      clusters.forEach((cluster) => {
        if (cluster.points.length === 1) {
          const point = cluster.points[0]!;
          const marker = L.marker([point.lat, point.lon], { icon: defaultIcon });
          marker.bindPopup(buildPopupHtml(point), { className: 'map-popup-container' });
          layer.addLayer(marker);
          return;
        }

        const icon = L.divIcon({
          className: 'map-cluster-marker',
          html: `<span class="map-cluster-badge">${cluster.points.length}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const marker = L.marker([cluster.lat, cluster.lon], { icon });
        const popupHtml = `
          <div class="map-popup">
            <div><strong>${escapeHtml(`${cluster.points.length} devices here`)}</strong></div>
            ${cluster.points
              .map((point) => {
                const lines = [point.label, point.time].filter((value): value is string => Boolean(value));
                return `<div style="margin-top:0.35rem">${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
              })
              .join('')}
          </div>
        `;
        marker.bindPopup(popupHtml, { className: 'map-popup-container' });
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

    bookmarks.forEach((bookmark) => {
      const icon = L.divIcon({
        className: 'map-bookmark-marker',
        html: '<span class="map-bookmark-pin" aria-hidden="true"></span>',
        iconSize: [18, 24],
        iconAnchor: [9, 24],
      });
      const marker = L.marker([bookmark.lat, bookmark.lon], { icon });
      const popupLines = [bookmark.label, bookmark.notes, `Lat ${bookmark.lat.toFixed(5)}, Lon ${bookmark.lon.toFixed(5)}`]
        .filter((value): value is string => Boolean(value));
      const popupHtml = `<div class="map-popup">${popupLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
      marker.bindPopup(popupHtml, { className: 'map-popup-container' });
      layer.addLayer(marker);
    });

    const map = mapRef.current;
    const allPoints = latLngs
      .concat(stops.map((s) => [s.lat, s.lon] as L.LatLngExpression))
      .concat(bookmarks.map((bookmark) => [bookmark.lat, bookmark.lon] as L.LatLngExpression));
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds.pad(0.2), { maxZoom: 16, animate: false });
    }
  }, [positions, stops, bookmarks, showRoute, onMapClick, onAddStopAtPoint, speedSegments]);

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

  if (positions.length === 0 && stops.length === 0 && bookmarks.length === 0) {
    return (
      <div className={`map-placeholder ${className}`} style={{ height }}>
        <span className="muted">No positions to show on map</span>
      </div>
    );
  }

  return (
    <div className={`track-map-wrap ${className}`}>
      <div
        ref={containerRef}
        className="track-map"
        style={{ height }}
      />
      {showSpeedLegend && (
        <div className="track-map-speed-legend" aria-label="Speed color legend">
          <div className="track-map-speed-legend-title">Route speed</div>
          {SPEED_BANDS.map((band) => (
            <div key={band.label} className="track-map-speed-legend-row">
              <span className="track-map-speed-legend-swatch" style={{ backgroundColor: band.color }} />
              <span>{band.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
