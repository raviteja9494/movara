import { useState, useRef, useCallback, useEffect } from 'react';
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

function formatValue(value: number | undefined, unit: string): string {
  if (value == null || Number.isNaN(value)) return '—';
  const v = unit === '%' ? Math.round(value) : value.toFixed(1);
  return `${v} ${unit}`;
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

/** One value per unique timestamp (dedupe index). Used for path and min/max so max speed is correct with duplicate timestamps. */
type Series = { label: string; valuesPerDedupe: number[]; min: number; max: number; unit: string };

export function SpeedChart({
  positions,
  speedUnit,
  useMph = false,
  plotSpeed = true,
  plotAltitude = false,
  plotBattery = false,
}: SpeedChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const sorted = [...positions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const times = sorted.map((p) => new Date(p.timestamp).getTime());
  const dedupe = times.map((t, i) => (i > 0 && times[i - 1] === t ? null : i)).filter((i): i is number => i !== null);
  const n = dedupe.length;

  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!wrapRef.current || !svgRef.current) return;
      const wrap = wrapRef.current.getBoundingClientRect();
      const svg = svgRef.current;
      const vb = svg.viewBox?.baseVal;
      const w = vb?.width ?? CHART_WIDTH;
      const h = vb?.height ?? CHART_HEIGHT;
      const scaleX = wrap.width / w;
      const scaleY = wrap.height / h;
      const x = (clientX - wrap.left) / scaleX;
      const y = (clientY - wrap.top) / scaleY;
      if (x < PAD.left || x > PAD.left + INNER_W || y < PAD.top || y > PAD.top + INNER_H) {
        setHoverIndex(null);
        setTooltipPos(null);
        return;
      }
      const frac = (x - PAD.left) / INNER_W;
      const idx = Math.round(frac * (Math.max(0, n - 1)));
      const clamped = n < 2 ? 0 : Math.max(0, Math.min(idx, n - 1));
      setHoverIndex(clamped);
      setTooltipPos({ x: clientX - wrap.left, y: clientY - wrap.top });
    },
    [n]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverIndex(null);
    setTooltipPos(null);
  }, []);

  // Clear hover when series or data change (must run unconditionally - Rules of Hooks)
  useEffect(() => {
    setHoverIndex(null);
    setTooltipPos(null);
  }, [plotSpeed, plotAltitude, plotBattery, positions.length]);

  if (n < 2) return null;

  const seriesList: Series[] = [];

  if (plotSpeed) {
    const values = sorted.map((p) => {
      const kmh = p.speed ?? 0;
      return useMph ? kmh * KMH_TO_MPH : kmh;
    });
    // Per unique timestamp use MAX speed so duplicate points don't hide real max
    const valuesPerDedupe = dedupe.map((i) => {
      const t = times[i];
      let max = values[i];
      for (let j = 0; j < times.length; j++) {
        if (times[j] === t) max = Math.max(max, values[j]);
      }
      return max;
    });
    const min = Math.min(...valuesPerDedupe);
    const max = Math.max(1, ...valuesPerDedupe);
    // Only add speed series if there is actual speed data (avoid flat 0 line when simulator has no speed)
    if (max > 0) {
      seriesList.push({ label: 'Speed', valuesPerDedupe, min, max, unit: speedUnit });
    }
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
      const valuesPerDedupe = dedupe.map((i) => padded[i]);
      seriesList.push({ label: 'Altitude', valuesPerDedupe, min: Math.min(min, ...padded), max: Math.max(max, ...padded), unit: 'm' });
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
      const valuesPerDedupe = dedupe.map((i) => padded[i]);
      seriesList.push({ label: 'Battery', valuesPerDedupe, min, max, unit: '%' });
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
    const points = s.valuesPerDedupe.map((v, k) => {
      const i = dedupe[k];
      const t = times[i];
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

  const hoverTime = hoverIndex != null && hoverIndex < n ? times[dedupe[hoverIndex]] : null;
  const showTooltip =
    hoverIndex != null &&
    hoverTime != null &&
    tooltipPos != null &&
    hoverIndex < n &&
    seriesList.every((s) => hoverIndex < s.valuesPerDedupe.length);

  return (
    <div
      ref={wrapRef}
      className="speed-chart-wrap"
      style={{ position: 'relative' }}
      onPointerDown={(e) => e.currentTarget.setPointerCapture?.(e.pointerId)}
      onPointerMove={(e) => handlePointer(e.clientX, e.clientY)}
      onPointerUp={handlePointerLeave}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
    >
      <h4 className="speed-chart-title">
        {singleSeries ? `${first.label} over time (${first.unit})` : 'Parameters over time'}
      </h4>
      <svg
        ref={svgRef}
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
        {hoverIndex != null && hoverTime != null && (
          <line
            x1={PAD.left + ((hoverTime - t0) / span) * INNER_W}
            y1={PAD.top + INNER_H}
            x2={PAD.left + ((hoverTime - t0) / span) * INNER_W}
            y2={PAD.top}
            stroke="var(--text-muted)"
            strokeWidth="1"
            strokeDasharray="4 2"
            opacity={0.7}
          />
        )}
      </svg>
      {showTooltip && (
        <div
          className="speed-chart-tooltip"
          role="tooltip"
          style={{
            position: 'absolute',
            left: Math.min(tooltipPos!.x + 10, (wrapRef.current?.offsetWidth ?? 400) - 140),
            bottom: (wrapRef.current?.offsetHeight ?? 0) - tooltipPos!.y + 12,
            maxWidth: 160,
            padding: '6px 10px',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: '0.8rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {formatTimeShort(new Date(hoverTime!).toISOString())}
          </div>
          {seriesList.map((s, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 2, backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length], borderRadius: 1 }} />
              {s.label}: {formatValue(s.valuesPerDedupe[hoverIndex!], s.unit)}
            </div>
          ))}
        </div>
      )}
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
