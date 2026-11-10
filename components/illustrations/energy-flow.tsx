/**
 * Rooftop solar energy flow, drawn as a lightweight inline SVG.
 * Technically accurate at a household level: panels produce DC, the inverter
 * converts it to AC for the home, an optional battery stores surplus, and excess
 * can be exported to the grid where net-metering has been approved by the utility.
 * Animated dashes use only stroke-dashoffset and stop under prefers-reduced-motion.
 */
export function EnergyFlowIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 420"
      className={className}
      role="img"
      aria-labelledby="ef-title ef-desc"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="ef-title">How rooftop solar powers a home</title>
      <desc id="ef-desc">
        Sunlight reaches the rooftop panels, which make DC electricity. An inverter converts it to AC for lights and
        appliances. An optional battery stores surplus for the evening, and approved net-metering lets excess flow to
        the grid.
      </desc>
      <defs>
        <radialGradient id="ef-sun" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#ffd34d" />
          <stop offset="0.6" stopColor="#ffb31a" />
          <stop offset="1" stopColor="#f7931e" />
        </radialGradient>
        <linearGradient id="ef-panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f8a1a" />
          <stop offset="1" stopColor="#0b4012" />
        </linearGradient>
        <linearGradient id="ef-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="1" stopColor="#f7f8f2" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Sky wash + ground */}
      <rect x="0" y="0" width="600" height="360" rx="24" fill="url(#ef-sky)" />
      <path d="M20 360 H580" stroke="#c9d2bd" strokeWidth="2" strokeLinecap="round" />
      <path d="M60 372 H540" stroke="#e1e7d8" strokeWidth="2" strokeLinecap="round" />

      {/* Sun */}
      <circle className="sun-glow" cx="92" cy="86" r="50" fill="#ffb31a" opacity="0.25" />
      <circle cx="92" cy="86" r="30" fill="url(#ef-sun)" />
      <g stroke="#f7931e" strokeWidth="3" strokeLinecap="round">
        <path d="M92 36v-10M92 146v-10M42 86H32M152 86h-10M57 51l-7-7M134 128l-7-7M127 51l7-7M50 128l7-7" />
      </g>

      {/* Sunlight to panels */}
      <g stroke="#f7931e" strokeWidth="2.5" strokeLinecap="round">
        <path className="energy-flow" d="M118 104 L228 186" />
        <path className="energy-flow" d="M126 80 L266 160" />
        <path className="energy-flow" d="M108 118 L196 206" />
      </g>

      {/* House */}
      <path d="M210 236 V360 H420 V236" fill="#ffffff" stroke="#0b4012" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M186 240 L315 150 L444 240" fill="#ecf1e4" stroke="#0b4012" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Panels on the sun-facing roof slope */}
      <g transform="translate(190 236) rotate(-34.8)">
        <rect x="18" y="-19" width="118" height="15" rx="2.5" fill="url(#ef-panel)" stroke="#0b4012" strokeWidth="1.5" />
        <g stroke="#9fd67a" strokeWidth="1.2" opacity="0.9">
          <path d="M47.5 -19 V-4 M77 -19 V-4 M106.5 -19 V-4 M18 -11.5 H136" />
        </g>
        <path d="M18 -23 H136" stroke="#57bb12" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </g>

      {/* Windows: a light and an aircon, powered from the inverter */}
      <rect x="234" y="262" width="50" height="40" rx="5" fill="#fff6dc" stroke="#0b4012" strokeWidth="2" />
      <circle cx="259" cy="279" r="7" fill="#ffd34d" stroke="#f7931e" strokeWidth="1.5" />
      <path d="M255 288 h8" stroke="#0b4012" strokeWidth="2" strokeLinecap="round" />
      <rect x="348" y="262" width="50" height="40" rx="5" fill="#f2f8ec" stroke="#0b4012" strokeWidth="2" />
      <rect x="356" y="272" width="34" height="12" rx="3" fill="#ffffff" stroke="#0b4012" strokeWidth="1.5" />
      <path d="M362 290 v4 M373 290 v4 M384 290 v4" stroke="#57bb12" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="298" y="306" width="34" height="54" rx="4" fill="#ecf1e4" stroke="#0b4012" strokeWidth="2" />
      <circle cx="324" cy="334" r="2" fill="#0b4012" />

      {/* Inverter */}
      <rect x="118" y="266" width="50" height="62" rx="8" fill="#ffffff" stroke="#12601c" strokeWidth="2.5" />
      <path d="M128 288 q5 -9 10 0 t10 0 t10 0" stroke="#12601c" strokeWidth="2" strokeLinecap="round" />
      <circle cx="143" cy="312" r="3.5" fill="#57bb12" />

      {/* Battery (optional) */}
      <rect x="452" y="290" width="42" height="64" rx="7" fill="#ffffff" stroke="#12601c" strokeWidth="2.5" strokeDasharray="5 4" />
      <rect x="465" y="284" width="16" height="6" rx="2" fill="#12601c" />
      <rect x="460" y="330" width="26" height="16" rx="2.5" fill="#57bb12" />
      <rect x="460" y="311" width="26" height="15" rx="2.5" fill="#57bb12" opacity="0.55" />

      {/* Grid pylon */}
      <g stroke="#36493b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M528 360 L541 252 L554 360" />
        <path d="M531 334 H551 M534 306 H548 M524 270 H558 M531 334 L548 306 M551 334 L534 306" />
      </g>

      {/* Energy paths */}
      <g strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* DC: panels to inverter */}
        <path className="energy-flow" d="M206 230 C 180 240 150 246 143 266" stroke="#1d7a18" />
        {/* AC: inverter into the home */}
        <path className="energy-flow" d="M168 298 H234" stroke="#57bb12" />
        {/* Home to battery (optional) */}
        <path className="energy-flow" d="M420 322 H452" stroke="#57bb12" />
        {/* Export to grid where net-metering is approved */}
        <path className="energy-flow" d="M436 236 C 478 222 512 236 528 266" stroke="#57bb12" />
      </g>

      {/* Labels sit on one baseline under the ground line */}
      <g fontFamily="inherit" fontSize="16" fontWeight="650" fill="#36493b" textAnchor="middle">
        <text x="318" y="112">Solar panels</text>
        <text x="143" y="391">Inverter</text>
        <text x="315" y="391">Your home</text>
        <text x="473" y="391">Battery</text>
        <text x="541" y="391">Grid</text>
      </g>
      <g fontFamily="inherit" fontSize="13" fill="#5b6b5f" textAnchor="middle">
        <text x="318" y="130">make DC power</text>
        <text x="143" y="410">DC to AC</text>
        <text x="315" y="410">uses it first</text>
        <text x="473" y="410">optional</text>
        <text x="541" y="410">excess out</text>
      </g>
    </svg>
  );
}
