// Dependency-free SVG line + area chart. Accessible: role="img" with a label,
// per-point <title> tooltips, and a visually-hidden data table carrying the exact
// values (meaning is never carried by the line alone). Colours are tokens, so it
// follows light/dark automatically.
import { formatNumber } from "../../lib/format";

export interface LinePoint {
  label: string;
  value: number;
}

interface LineChartProps {
  points: LinePoint[];
  ariaLabel: string;
  valueLabel: string;
}

export function LineChart({ points, ariaLabel, valueLabel }: LineChartProps) {
  const W = 560, H = 210, padL = 40, padR = 12, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(...points.map((p) => p.value), 1);
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / niceMax) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${line} L${x(points.length - 1).toFixed(1)},${padT + innerH} L${x(0).toFixed(1)},${padT + innerH} Z` : "";
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const labelIdx = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
        {grid.map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={padT + innerH * (1 - g)} y2={padT + innerH * (1 - g)} stroke="var(--divider)" />
            <text x={padL - 6} y={padT + innerH * (1 - g) + 4} textAnchor="end" fontSize="10" fill="var(--foreground-muted)">
              {formatNumber(Math.round(niceMax * g))}
            </text>
          </g>
        ))}
        {area && <path d={area} fill="var(--info-soft)" opacity="0.9" />}
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={points.length > 31 ? 0 : 3} fill="var(--surface)" stroke="var(--primary)" strokeWidth="2">
            <title>{`${p.label}: ${formatNumber(p.value)} ${valueLabel}`}</title>
          </circle>
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="10" fill="var(--foreground-secondary)">
            {points[i]?.label}
          </text>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">{valueLabel}</th></tr></thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}><td>{p.label}</td><td>{p.value}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
