// 7-day revenue bars. Plain SVG, no chart dependency. Accessible: the SVG is
// described by a visually-hidden table with the exact values (doc02 §9 —
// meaning is never carried by shape/colour alone).

import { formatMoney, weekdayShort } from "../../lib/format";
import type { SalesTrendPoint } from "../../types/dashboard";

export function SalesBars({ points, currency }: { points: SalesTrendPoint[]; currency: string | null }) {
  const values = points.map((p) => Number(p.revenue));
  const max = Math.max(...values, 0);

  const W = 560;
  const H = 200;
  const padX = 8;
  const padTop = 12;
  const padBottom = 28;
  const innerH = H - padTop - padBottom;
  const slot = (W - padX * 2) / points.length;
  const barW = slot * 0.56;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue per day, last 7 days" className="h-auto w-full">
        <line x1={padX} x2={W - padX} y1={H - padBottom} y2={H - padBottom} stroke="var(--border)" />
        {points.map((p, i) => {
          const v = values[i];
          const h = max > 0 ? Math.max((v / max) * innerH, v > 0 ? 3 : 0) : 0;
          const x = padX + i * slot + (slot - barW) / 2;
          const isToday = i === points.length - 1;
          return (
            <g key={p.date}>
              <rect
                x={x}
                y={H - padBottom - h}
                width={barW}
                height={h}
                rx={3}
                fill={isToday ? "var(--primary)" : "var(--foreground-muted)"}
                opacity={isToday ? 1 : 0.55}
              >
                <title>{`${p.date}: ${formatMoney(p.revenue, currency)} (${p.count} sales)`}</title>
              </rect>
              <text
                x={x + barW / 2}
                y={H - 10}
                textAnchor="middle"
                fontSize="11"
                fill="var(--foreground-secondary)"
              >
                {weekdayShort(p.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Revenue per day, last 7 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Revenue</th>
            <th scope="col">Sales</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{formatMoney(p.revenue, currency)}</td>
              <td>{p.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
