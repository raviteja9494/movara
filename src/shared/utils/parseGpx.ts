/**
 * Minimal GPX 1.1 track parser. Extracts trkpt (lat, lon), time, and optional speed from extensions.
 */
export interface GpxPoint {
  latitude: number;
  longitude: number;
  timestamp: Date;
  speed?: number;
}

export function parseGpxTrackPoints(xml: string): GpxPoint[] {
  const points: GpxPoint[] = [];
  // Match <trkpt lat="..." lon="..."> ... </trkpt>
  const trkptRe = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)">([\s\S]*?)<\/trkpt>/gi;
  let m: RegExpExecArray | null;
  while ((m = trkptRe.exec(xml)) !== null) {
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    const inner = m[3] || '';
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const timeMatch = inner.match(/<time>([^<]+)<\/time>/i);
    const timeStr = timeMatch ? timeMatch[1].trim() : null;
    const timestamp = timeStr && !Number.isNaN(new Date(timeStr).getTime())
      ? new Date(timeStr)
      : new Date(0); // fallback
    let speed: number | undefined;
    const speedMatch = inner.match(/<speed>([^<]+)<\/speed>/i);
    if (speedMatch) {
      const s = parseFloat(speedMatch[1]);
      if (!Number.isNaN(s)) speed = s;
    }
    points.push({ latitude: lat, longitude: lon, timestamp, speed });
  }
  return points.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
