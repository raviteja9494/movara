import type { Position } from '../api/positions';

const CHART_WIDTH = 400;
const CHART_HEIGHT = 160;
const PAD = { left: 40, right: 12, top: 10, bottom: 22 };
const INNER_W = CHART_WIDTH - PAD.left - PAD.right;
const INNER_H = CHART_HEIGHT - PAD.top - PAD.bottom;

const SERIES_COLORS = ['var(--accent)', '#059669', '#b45309'];

function formatTimeShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

interface SpeedChartProps {
  positions: Position[];
  speedUnit: string;
  useMph?: boolean;
  plotSpeed?: boolean;
  plotAltitude?: boolean;
  plotBattery?: boolean;
}

const KMH_TO_MPH = 1 / 1.609344;

type Series = { label: string; values: number[]; min: number; max: number; unit: string };

export function SpeedChart({
  positions,
  speedUnit,
  useMph = false,
  plotSpeed = true,
  plotAltitude = false,
  plotBattery = false,
}: SpeedChartProps) {
  const sorted = [...positions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const times = sorted.map((p) => new Date(p.timestamp).getTime());
  const dedupe = times.map((t, i) => (i > 0 && times[i - 1] === t ? null : i)).filter((i): i is number => i !== null);
  const n = dedupe.length;
  if (n < 2) return null;

  const seriesList: Series[] = [];

  if (plotSpeed) {
    const values = sorted.map((p) => {
      const kmh = p.speed ?? 0;
      return useMph ? kmh * KMH_TO_MPH : kmh;
    });
    const min = Math.min(...values);
    const max = Math.max(1, ...values);
    seriesList.push({ label: 'Speed', values, min, max, unit: speedUnit });
  }

  if (plotAltitude) {
    const values = sorted.map((p) => {
      const v = p.attributes?.altitude;
      return typeof v === 'number' ? v : null;
    });
    const defined = values.filter((v): v is number => v !== null);
    if (defined.length > 0) {
      const min = Math.min(...defined);
      const max = Math.max(...defined);
      const range = max - min || 1;
      const padded = values.map((v) => (v !== null ? v : min - range * 0.1));
      seriesList.push({ label: 'Altitude', values: padded, min: Math.min(min, ...padded), max: Math.max(max, ...padded), unit: 'm' });
    }
  }

  if (plotBattery) {
    const values = sorted.map((p) => {
      const v = p.attributes?.battery_level;
      return typeof v === 'number' ? v * 100 : null;
    });
    const defined = values.filter((v): v is number => v !== null);
    if (defined.length > 0) {
      const min = Math.min(0, ...defined);
      const max = Math.max(100, ...defined);
      const padded = values.map((v) => (v !== null ? v : 0));
      seriesList.push({ label: 'Battery', values: padded, min, max, unit: '%' });
    }
  }

  if (seriesList.length === 0) return null;

  const t0 = times[dedupe[0]];
  const t1 = times[dedupe[dedupe.length - 1]];
  const span = t1 - t0 || 1;

  const singleSeries = seriesList.length === 1;
  const first = seriesList[0];

  const paths = seriesList.map((s, idx) => {
    const min = s.min;
    const range = (s.max - min) || 1;
    const points = dedupe.map((i) => {
      const t = times[i];
      const v = s.values[i];
      const x = PAD.left + ((t - t0) / span) * INNER_W;
      const norm = (v - min) / range;
      const y = PAD.top + INNER_H - norm * INNER_H;
      return `${x},${y}`;
    });
    return { path: `M ${points.join(' L ')}`, color: SERIES_COLORS[idx % SERIES_COLORS.length], series: s };
  });

  const yMax = singleSeries ? first.max : 1;
  const yMin = singleSeries ? first.min : 0;
  const yRange = yMax - yMin || 1;
  const yTicks = singleSeries
    ? [first.min, first.min + (first.max - first.min) * 0.5, first.max].map((v) => Math.round(v * 10) / 10)
    : [0, 0.5, 1];

  const yLabels = yTicks.map((v, i) => {
    const norm = singleSeries ? (v - yMin) / yRange : (v as number);
    return (
      <text
        key={i}
        x={PAD.left - 6}
        y={PAD.top + INNER_H - norm * INNER_H + 4}
        textAnchor="end"
        fontSize="10"
        fill="var(--text-muted)"
      >
        {singleSeries ? (first.unit === '%' ? Math.round(v) : v) : `${Math.round((v as number) * 100)}%`}
      </text>
    );
  });

  const xTickCount = 5;
  const xLabels = Array.from({ length: xTickCount + 1 }, (_, i) => {
    const idx = dedupe[Math.round((i / xTickCount) * (dedupe.length - 1))];
    const t = times[idx];
    if (t == null) return null;
    return (
      <text
        key={i}
        x={PAD.left + (i / xTickCount) * INNER_W}
        y={CHART_HEIGHT - 4}
        textAnchor="middle"
        fontSize="9"
        fill="var(--text-muted)"
      >
        {formatTimeShort(new Date(t).toISOString())}
      </text>
    );
  });

  return (
    <div className="speed-chart-wrap">
      <h4 className="speed-chart-title">
        {singleSeries ? `${first.label} over time (${first.unit})` : 'Parameters over time'}
      </h4>
      <svg
        className="speed-chart"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + INNER_H}
          stroke="var(--border)"
          strokeWidth="1"
        />
        <line
          x1={PAD.left}
          y1={PAD.top + INNER_H}
          x2={PAD.left + INNER_W}
          y2={PAD.top + INNER_H}
          stroke="var(--border)"
          strokeWidth="1"
        />
        {yLabels}
        {xLabels}
        {paths.map(({ path, color }, idx) => (
          <path
            key={idx}
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {paths.length > 1 && (
        <div className="speed-chart-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
          {paths.map(({ color, series }, idx) => (
            <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: 12, height: 3, backgroundColor: color, borderRadius: 1 }} />
              {series.label}: {series.min.toFixed(series.unit === '%' ? 0 : 1)}–{series.max.toFixed(series.unit === '%' ? 0 : 1)} {series.unit}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
