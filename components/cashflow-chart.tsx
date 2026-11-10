import { peso } from "@/lib/format";
import type { CashflowYear } from "@/lib/solar/engine";

export function CashflowChart({ cashflows }: { cashflows: CashflowYear[] }) {
  const width = 720;
  const height = 220;
  const pad = { left: 8, right: 8, top: 16, bottom: 30 };
  const values = cashflows.map((c) => c.cumulativePhp);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min || 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (index / Math.max(1, cashflows.length - 1)) * innerW;
  const y = (value: number) => pad.top + ((max - value) / span) * innerH;

  const line = cashflows.map((c, i) => `${x(i).toFixed(1)},${y(c.cumulativePhp).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const area = `${pad.left},${zeroY} ${line} ${x(cashflows.length - 1)},${zeroY}`;
  const breakEven = cashflows.find((c) => c.cumulativePhp >= 0);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Cumulative cashflow over 25 years. Break-even ${breakEven ? `in year ${breakEven.year}` : "not reached"}.`}
      >
        <defs>
          <linearGradient id="cf-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d7a18" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#1d7a18" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke="#dcd6c6" strokeWidth="1" strokeDasharray="4 4" />
        <polygon points={area} fill="url(#cf-fill)" />
        <polyline points={line} fill="none" stroke="#12601c" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {breakEven ? (
          <g>
            <circle cx={x(cashflows.indexOf(breakEven))} cy={y(breakEven.cumulativePhp)} r="4" fill="#ffb31a" stroke="#ffffff" strokeWidth="2" />
            <text x={x(cashflows.indexOf(breakEven)) + 8} y={y(breakEven.cumulativePhp) - 8} fontSize="12" fill="#6b4708">
              Break-even
            </text>
          </g>
        ) : null}
        {[0, 5, 10, 15, 20, 24].map((index) => (
          <text key={index} x={x(index)} y={height - 8} fontSize="12" fill="#66756c" textAnchor={index === 0 ? "start" : index === 24 ? "end" : "middle"}>
            Yr {cashflows[index]?.year ?? index + 1}
          </text>
        ))}
        <text x={pad.left} y={12} fontSize="12" fill="#66756c">{peso(max, { compact: true })}</text>
        <text x={pad.left} y={zeroY - 6} fontSize="12" fill="#66756c">₱0</text>
      </svg>
      <figcaption className="mt-1 text-xs text-muted">
        Cumulative net cashflow in nominal pesos, including estimated maintenance and inverter replacement. Not a
        guarantee; see assumptions below.
      </figcaption>
    </figure>
  );
}
