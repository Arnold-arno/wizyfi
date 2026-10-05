// Donut with a text legend (counts beside every label), so no state is
// distinguishable by colour alone.

import { formatNumber } from "../../lib/format";
import { TONE_VAR, type Tone } from "../ui/StatusBadge";

export interface DonutSegment {
  label: string;
  value: number;
  tone: Tone;
}

export function StatusDonut({ segments, centerLabel }: { segments: DonutSegment[]; centerLabel: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const len = (s.value / total) * C;
      const arc = { ...s, len, offset };
      offset += len;
      return arc;
    });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${centerLabel}: ${total}`} className="h-36 w-36 shrink-0">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--border)" strokeWidth="16" />
        <g transform="rotate(-90 70 70)">
          {arcs.map((a) => (
            <circle
              key={a.label}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={`var(${TONE_VAR[a.tone]})`}
              strokeWidth="16"
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={-a.offset}
            />
          ))}
        </g>
        <text x="70" y="68" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--foreground)">
          {formatNumber(total)}
        </text>
        <text x="70" y="86" textAnchor="middle" fontSize="10" fill="var(--foreground-secondary)">
          {centerLabel}
        </text>
      </svg>

      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[var(--foreground-secondary)]">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: `var(${TONE_VAR[s.tone]})` }}
              />
              {s.label}
            </span>
            <span className="tabular-nums text-[var(--foreground)]">{formatNumber(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
