/**
 * Guards for generated prose. Every number a model writes must come from the
 * structured facts we supplied (or a simple rounding of one); otherwise the output is
 * rejected and a deterministic fallback is used. This keeps arithmetic in code.
 */

const NUMBER_PATTERN = /(?<![A-Za-z])[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![A-Za-z])[-+]?\d+(?:\.\d+)?/g;

/** Numbers appearing in text, ignoring thousands separators. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(value)) out.push(Math.abs(value));
  }
  return out;
}

/** Collects every finite number in a nested facts object, plus percent forms of ratios. */
export function collectAllowedNumbers(facts: unknown, extra: number[] = []): number[] {
  const out = new Set<number>(extra);
  const walk = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      const v = Math.abs(value);
      out.add(v);
      if (v > 0 && v <= 1.5) out.add(v * 100);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };
  walk(facts);
  return [...out];
}

function matches(n: number, allowed: number): boolean {
  if (n === allowed) return true;
  const tolerance = Math.max(0.051, Math.abs(allowed) * 0.006);
  if (Math.abs(n - allowed) <= tolerance) return true;
  // Rounded forms: whole number, one decimal, thousands ("₱162k" style is written as 162).
  if (Math.round(allowed) === n || Math.round(allowed * 10) / 10 === n) return true;
  if (allowed >= 10000 && Math.round(allowed / 1000) === n) return true;
  return false;
}

/** Small integers (counts, months, list numbering) are not treated as claims. */
const IGNORE_BELOW = 13;

export function checkGrounding(text: string, allowed: number[]): { ok: boolean; unexpected: number[] } {
  const unexpected = extractNumbers(text).filter(
    (n) => !(Number.isInteger(n) && n < IGNORE_BELOW) && !allowed.some((a) => matches(n, a)),
  );
  return { ok: unexpected.length === 0, unexpected };
}

/** Claims the product must never make, in English or Filipino. */
const BANNED = [
  /guarantee/i,
  /garantisado/i,
  /siguradong/i,
  /\bpromise[sd]?\b/i,
  /structurally (sound|safe|suitable)/i,
  /\b(DOE|ERC)[- ]?(approved|certified|accredited)/i,
  /approved by (the )?(DOE|ERC|meralco|utility)/i,
  /best (installer|provider|company)/i,
  /pinakamagaling na (installer|provider)/i,
];

export function hasBannedClaim(text: string): boolean {
  return BANNED.some((pattern) => pattern.test(text));
}

/** Removes things that look like contact details or links from untrusted model text. */
export function scrubUntrusted(text: string, maxLength = 500): string {
  return text
    .replace(/https?:\/\/\S+/gi, "[link removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removed]")
    .replace(/(\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}/g, "[number removed]")
    .slice(0, maxLength)
    .trim();
}
