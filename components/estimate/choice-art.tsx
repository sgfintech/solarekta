/**
 * Small, consistent illustrations for wizard choices. 48×48 viewBox, 2px strokes,
 * brand greens and sun accents. Decorative only: every choice also has a text label.
 */
type ArtProps = { className?: string };

const stroke = { stroke: "#0b4012", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function House({ windowFill = "#ffffff" }: { windowFill?: string }) {
  return (
    <>
      <path d="M10 24 24 13l14 11" {...stroke} fill="none" />
      <path d="M14 22v14h20V22" {...stroke} fill="#ffffff" />
      <rect x="18" y="26" width="5" height="5" rx="1" fill={windowFill} {...stroke} strokeWidth={1.5} />
      <rect x="26" y="27" width="5" height="9" rx="1" fill="#ecf1e4" {...stroke} strokeWidth={1.5} />
    </>
  );
}

export function UsageLowArt({ className = "h-12 w-12" }: ArtProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      <path d="M36 6a6 6 0 1 0 6 8 5 5 0 0 1-6-8Z" fill="#ffd34d" stroke="#f7931e" strokeWidth="1.5" />
      <House windowFill="#ffd34d" />
    </svg>
  );
}

export function UsageMediumArt({ className = "h-12 w-12" }: ArtProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      <circle cx="37" cy="10" r="4.5" fill="#ffb31a" stroke="#f7931e" strokeWidth="1.5" />
      <path d="M37 2.5v1.5M37 16v1.5M29.5 10H31M43 10h1.5" stroke="#f7931e" strokeWidth="1.5" strokeLinecap="round" />
      <House windowFill="#fff0c7" />
    </svg>
  );
}

export function UsageHighArt({ className = "h-12 w-12" }: ArtProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      <circle cx="37" cy="10" r="5.5" fill="#ffb31a" stroke="#f7931e" strokeWidth="1.5" />
      <path d="M37 1.5v2M37 16.5v2M28.5 10h2M43.5 10h2M31 4l1.4 1.4M41.6 14.6 43 16M43 4l-1.4 1.4M32.4 14.6 31 16" stroke="#f7931e" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 36V18h18v18M26 24h12v12" {...stroke} fill="#ffffff" />
      <path d="M12 22h3M19 22h3M12 27h3M19 27h3M30 28h4" stroke="#57bb12" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 36h36" {...stroke} />
    </svg>
  );
}

export function HomeArt({ className = "h-12 w-12" }: ArtProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      <path d="M14 21.5 24 14l10 7.5" stroke="#1d7a18" strokeWidth="3" strokeLinecap="round" />
      <House />
    </svg>
  );
}

export function BusinessArt({ className = "h-12 w-12" }: ArtProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      <path d="M9 36V20l7-5h16l7 5v16" {...stroke} fill="#ffffff" />
      <path d="M9 20h30" {...stroke} />
      <path d="M12 20c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3" stroke="#57bb12" strokeWidth="2" strokeLinecap="round" />
      <rect x="15" y="27" width="8" height="9" rx="1" fill="#ecf1e4" {...stroke} strokeWidth={1.5} />
      <rect x="27" y="27" width="8" height="5" rx="1" fill="#fff0c7" {...stroke} strokeWidth={1.5} />
    </svg>
  );
}

export function RoofArt({ kind, className = "h-12 w-12" }: ArtProps & { kind: "concrete" | "metal" | "tile" | "asbestos" | "unknown" }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      {kind === "concrete" ? (
        <>
          <rect x="8" y="18" width="32" height="6" rx="1.5" fill="#ecf1e4" {...stroke} />
          <path d="M11 24v12h26V24" {...stroke} fill="#ffffff" />
          <path d="M15 14h12l2 4H13l2-4Z" fill="#12601c" stroke="#0b4012" strokeWidth="1.5" strokeLinejoin="round" />
        </>
      ) : kind === "metal" ? (
        <>
          <path d="M8 24 24 12l16 12" {...stroke} fill="#ecf1e4" />
          <path d="M13 21l3 2M18 17.5l3 2M23 14l3 2" stroke="#57bb12" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 23v13h24V23" {...stroke} fill="#ffffff" />
        </>
      ) : kind === "tile" ? (
        <>
          <path d="M8 24 24 12l16 12" {...stroke} fill="#fff0c7" />
          <path d="M14 20.5q2 2 4 0t4 0M18 17.5q2 2 4 0t4 0" stroke="#f7931e" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 23v13h24V23" {...stroke} fill="#ffffff" />
        </>
      ) : kind === "asbestos" ? (
        <>
          <path d="M8 24 24 12l16 12" {...stroke} fill="#ecf1e4" />
          <path d="M12 23v13h24V23" {...stroke} fill="#ffffff" />
          <path d="M24 22l6 10H18l6-10Z" fill="#fff0c7" stroke="#b5401f" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M24 25.5v3M24 30.3v.2" stroke="#b5401f" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M8 24 24 12l16 12" {...stroke} fill="#ecf1e4" strokeDasharray="3 3" />
          <path d="M12 23v13h24V23" {...stroke} fill="#ffffff" />
          <path d="M21 26.5a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.8M24 33.5v.2" stroke="#12601c" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function ExportArt({ kind, className = "h-12 w-12" }: ArtProps & { kind: "net_metering" | "zero_export" | "not_sure" }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      <path d="M6 28 16 20l10 8" {...stroke} fill="#ecf1e4" />
      <path d="M9 26v10h14V26" {...stroke} fill="#ffffff" />
      <path d="M38 36 42 14M42 14l4 22M38.5 30h7M39.5 24h5" stroke="#36493b" strokeWidth="1.8" strokeLinecap="round" />
      {kind === "net_metering" ? (
        <path d="M24 22c5-4 10-4 14-2" stroke="#57bb12" strokeWidth="2.5" strokeLinecap="round" />
      ) : kind === "zero_export" ? (
        <>
          <path d="M24 22c4-3 7-3.5 9-3" stroke="#57bb12" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M33 15v8" stroke="#b5401f" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <path d="M27 18.5a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.1-1.5 2M30.5 27.5v.2" stroke="#12601c" strokeWidth="2.2" strokeLinecap="round" />
      )}
      {kind === "net_metering" ? (
        <path d="m35 17 3.4 2.8-4 1.6" stroke="#57bb12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}
