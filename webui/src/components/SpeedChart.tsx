import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  const [crosshairX, setCrosshairX] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const { sorted, times, dedupe, n } = useMemo(() => {
    const s = [...positions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const t = s.map((p) => new Date(p.timestamp).getTime());
    const d = t.map((ti, i) => (i > 0 && t[i - 1] === ti ? null : i)).filter((i): i is number => i !== null);
    return { sorted: s, times: t, dedupe: d, n: d.length };
  }, [positions]);

  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
      pendingPointerRef.current = { clientX, clientY };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const p = pendingPointerRef.current;
        if (!p || !wrapRef.current || !svgRef.current) return;
        const wrap = wrapRef.current.getBoundingClientRect();
        const svgRect = svgRef.current.getBoundingClientRect();
        const w = CHART_WIDTH;
        const h = CHART_HEIGHT;
        const scale = Math.min(svgRect.width / w, svgRect.height / h);
        const contentLeft = svgRect.left + (svgRect.width - w * scale) / 2;
        const contentTop = svgRect.top + (svgRect.height - h * scale) / 2;
        const x = (p.clientX - contentLeft) / scale;
        const y = (p.clientY - contentTop) / scale;
        if (x < PAD.left || x > PAD.left + INNER_W || y < PAD.top || y > PAD.top + INNER_H) {
          setHoverIndex(null);
          setTooltipPos(null);
          setCrosshairX(null);
          return;
        }
        const frac = (x - PAD.left) / INNER_W;
        const idx = Math.round(frac * (Math.max(0, n - 1)));
        const clamped = n < 2 ? 0 : Math.max(0, Math.min(idx, n - 1));
        setHoverIndex(clamped);
        setTooltipPos({ x: p.clientX - wrap.left, y: p.clientY - wrap.top });
        setCrosshairX(x);
      });
    },
    [n]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverIndex(null);
    setTooltipPos(null);
    setCrosshairX(null);
  }, []);

  useEffect(() => {
    setHoverIndex(null);
    setTooltipPos(null);
    setCrosshairX(null);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [plotSpeed, plotAltitude, plotBattery, positions.length]);

  const seriesList = useMemo(() => {
    const list: Series[] = [];
    if (plotSpeed) {
      const values = sorted.map((p) => {
        const kmh = p.speed ?? 0;
        return useMph ? kmh * KMH_TO_MPH : kmh;
      });
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
      if (max > 0) list.push({ label: 'Speed', valuesPerDedupe, min, max, unit: speedUnit });
    }
    if (plotAltitude) {
      const values = sorted.map((p) => (typeof p.attributes?.altitude === 'number' ? p.attributes.altitude : null));
      const defined = values.filter((v): v is number => v !== null);
      if (defined.length > 0) {
        const min = Math.min(...defined);
        const max = Math.max(...defined);
        const range = max - min || 1;
        const padded = values.map((v) => (v !== null ? v : min - range * 0.1));
        const valuesPerDedupe = dedupe.map((i) => padded[i]);
        list.push({ label: 'Altitude', valuesPerDedupe, min: Math.min(min, ...padded), max: Math.max(max, ...padded), unit: 'm' });
      }
    }
    if (plotBattery) {
      const values = sorted.map((p) => (typeof p.attributes?.battery_level === 'number' ? p.attributes.battery_level * 100 : null));
      const defined = values.filter((v): v is number => v !== null);
      if (defined.length > 0) {
        const min = Math.min(0, ...defined);
        const max = Math.max(100, ...defined);
        const padded = values.map((v) => (v !== null ? v : 0));
        const valuesPerDedupe = dedupe.map((i) => padded[i]);
        list.push({ label: 'Battery', valuesPerDedupe, min, max, unit: '%' });
      }
    }
    return list;
  }, [sorted, times, dedupe, plotSpeed, plotAltitude, plotBattery, speedUnit, useMph]);

  const chartGeometry = useMemo(() => {
    if (seriesList.length === 0) return null;
    const t0 = times[dedupe[0]];
    const t1 = times[dedupe[dedupe.length - 1]];
    const span = t1 - t0 || 1;
    const first = seriesList[0];
    const singleSeries = seriesList.length === 1;
    const paths = seriesList.map((s, idx) => {
      const min = s.min;
      const range = (s.max - min) || 1;
      const points = s.valuesPerDedupe.map((v, k) => {
        const i = dedupe[k];
        const t = times[i];
        const x = PAD.left + ((t - t0) / span) * INNER_W;
        const norm = (v - min) / range;
        const y = PAD.top + INNER_H - norm * INNER_H;
        return { x, y };
      });
      const pathD = `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`;
      const color = SERIES_COLORS[idx % SERIES_COLORS.length];
      return { pathD, points, color, series: s };
    });
    const yMax = singleSeries ? first.max : 1;
    const yMin = singleSeries ? first.min : 0;
    const yRange = yMax - yMin || 1;
    const yTicks = singleSeries
      ? [first.min, first.min + (first.max - first.min) * 0.5, first.max].map((v) => Math.round(v * 10) / 10)
      : [0, 0.5, 1];
    return { paths, first, singleSeries, yMin, yRange, yTicks };
  }, [seriesList, times, dedupe]);

  if (n < 2) return null;
  if (seriesList.length === 0) return null;
  if (chartGeometry == null) return null;

  const { paths, first, singleSeries, yMin, yRange, yTicks } = chartGeometry;

  function interpolateYAtX(points: { x: number; y: number }[], x: number): number {
    if (points.length === 0) return PAD.top + INNER_H / 2;
    if (points.length === 1 || x <= points[0].x) return points[0].y;
    if (x >= points[points.length - 1].x) return points[points.length - 1].y;
    for (let i = 0; i < points.length - 1; i++) {
      if (x >= points[i].x && x <= points[i + 1].x) {
        const t = (points[i + 1].x - points[i].x) ? (x - points[i].x) / (points[i + 1].x - points[i].x) : 0;
        return points[i].y + t * (points[i + 1].y - points[i].y);
      }
    }
    return points[points.length - 1].y;
  }

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
        {paths.map(({ pathD, color }, idx) => (
          <path
            key={idx}
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="speed-chart-line"
          />
        ))}
        {crosshairX != null && (
          <line
            x1={Math.round(crosshairX) + 0.5}
            y1={PAD.top}
            x2={Math.round(crosshairX) + 0.5}
            y2={PAD.top + INNER_H}
            stroke="var(--text)"
            strokeWidth="1"
            className="speed-chart-crosshair"
          />
        )}
        {crosshairX != null &&
          paths.map((p, idx) => {
            const cy = interpolateYAtX(p.points, crosshairX);
            return (
              <circle
                key={idx}
                cx={Math.round(crosshairX) + 0.5}
                cy={cy}
                r={4}
                fill="var(--surface)"
                stroke={p.color}
                strokeWidth={2}
                className="speed-chart-hover-dot"
              />
            );
          })}
      </svg>
      {showTooltip && (
        <div
          className="speed-chart-tooltip"
          role="tooltip"
          style={{
            position: 'absolute',
            left: Math.min(tooltipPos!.x + 10, (wrapRef.current?.offsetWidth ?? 400) - 160),
            bottom: (wrapRef.current?.offsetHeight ?? 0) - tooltipPos!.y + 12,
            minWidth: 140,
            maxWidth: 180,
            padding: '8px 12px',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: '0.8rem',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div className="speed-chart-tooltip-time">
            {formatTimeShort(new Date(hoverTime!).toISOString())}
          </div>
          {seriesList.map((s, idx) => (
            <div key={idx} className="speed-chart-tooltip-row">
              <span className="speed-chart-tooltip-swatch" style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }} />
              <span className="speed-chart-tooltip-label">{s.label}:</span>
              <span className="speed-chart-tooltip-value">{formatValue(s.valuesPerDedupe[hoverIndex!], s.unit)}</span>
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
