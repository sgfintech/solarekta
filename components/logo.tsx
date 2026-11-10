import Image from "next/image";
import Link from "next/link";

/**
 * Brand assets are derived from public/logo.png (the master file stays untouched):
 *  - /brand/solarekta-logo.png  full lockup, trimmed, white background removed (1200×330)
 *  - /brand/solarekta-mark.png  sun + solar-leaf mark only (269×256)
 * The lockup's wordmark is dark green, so on dark surfaces it sits on a white plate.
 */
const LOGO_W = 1200;
const LOGO_H = 330;

const SIZES = {
  sm: { className: "h-9", px: 131 },
  md: { className: "h-11", px: 160 },
  lg: { className: "h-14", px: 204 },
  xl: { className: "h-20", px: 291 },
} as const;

type LogoSize = keyof typeof SIZES;

export function LogoImage({ size = "md", eager = true }: { size?: LogoSize; eager?: boolean }) {
  const s = SIZES[size];
  return (
    <Image
      src="/brand/solarekta-logo.png"
      alt="SOLARekta"
      width={LOGO_W}
      height={LOGO_H}
      sizes={`${s.px}px`}
      loading={eager ? "eager" : "lazy"}
      className={`${s.className} w-auto select-none`}
      draggable={false}
    />
  );
}

export function Logo({
  href = "/",
  size = "md",
  tone = "dark",
  eager = true,
}: {
  href?: string | null;
  size?: LogoSize;
  tone?: "dark" | "light";
  eager?: boolean;
}) {
  const image = <LogoImage size={size} eager={eager} />;
  const content =
    tone === "light" ? (
      <span className="inline-flex rounded-2xl bg-white px-3 py-2 shadow-soft">{image}</span>
    ) : (
      image
    );

  if (href === null) return content;
  return (
    <Link href={href} className="inline-flex shrink-0 items-center rounded-lg no-underline">
      {content}
    </Link>
  );
}

export function LogoMark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/brand/solarekta-mark.png"
      alt=""
      aria-hidden="true"
      width={269}
      height={256}
      sizes="64px"
      className={className}
      draggable={false}
    />
  );
}
