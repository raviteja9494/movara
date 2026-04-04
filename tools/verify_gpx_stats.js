const fs = require('fs');
const path = process.argv[2] || 'path/to/trip.gpx';
if (!fs.existsSync(path)) {
  console.log('Usage: node verify_gpx_stats.js <path-to-gpx>');
  process.exit(1);
}
const xml = fs.readFileSync(path, 'utf8');
const trkptRe = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)">([\s\S]*?)<\/trkpt>/gi;
const points = [];
let m;
while ((m = trkptRe.exec(xml)) !== null) {
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  const inner = m[3] || '';
  const timeMatch = inner.match(/<time>([^<]+)<\/time>/i);
  const timeStr = timeMatch ? timeMatch[1].trim() : null;
  const timestamp = timeStr ? new Date(timeStr).getTime() : 0;
  if (!Number.isNaN(lat) && !Number.isNaN(lon)) points.push({ lat, lon, timestamp });
}
points.sort((a, b) => a.timestamp - b.timestamp);

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const MAX_REALISTIC = 120;
let totalKmAll = 0;
let totalKmFiltered = 0;
let totalTimeHFiltered = 0;
let maxSpeedFiltered = 0;

for (let i = 1; i < points.length; i++) {
  const a = points[i - 1];
  const b = points[i];
  const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
  const dtMs = b.timestamp - a.timestamp;
  totalKmAll += km;
  if (dtMs <= 0) continue;
  const dtH = dtMs / (1000 * 3600);
  const segSpeed = km / dtH;
  if (segSpeed > MAX_REALISTIC) continue;
  totalKmFiltered += km;
  totalTimeHFiltered += dtH;
  if (segSpeed > maxSpeedFiltered) maxSpeedFiltered = segSpeed;
}

const durationMin = (points[points.length - 1].timestamp - points[0].timestamp) / (1000 * 60);
const avgSpeedFiltered = totalTimeHFiltered > 0 ? totalKmFiltered / totalTimeHFiltered : 0;

console.log('GPX:', path);
console.log('Points:', points.length);
console.log('First:', new Date(points[0].timestamp).toISOString(), points[0].lat, points[0].lon);
console.log('Last:', new Date(points[points.length - 1].timestamp).toISOString(), points[points.length - 1].lat, points[points.length - 1].lon);
console.log('Duration (first->last):', durationMin.toFixed(1), 'min');
console.log('');
console.log('If we sum ALL segments (no filter):', totalKmAll.toFixed(3), 'km');
console.log('After excluding segments with speed > 120 km/h:');
console.log('  Odometer:', totalKmFiltered.toFixed(3), 'km');
console.log('  Avg speed:', avgSpeedFiltered.toFixed(1), 'km/h');
console.log('  Max speed:', maxSpeedFiltered.toFixed(1), 'km/h');
