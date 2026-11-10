import { findLocation } from "@/lib/solar/locations";
import { parseServiceAreas } from "@/lib/service-areas";
import type { InstallerRow } from "@/lib/types";

/**
 * Provider eligibility by service area. Matching is exact on normalised names, never
 * substring-based, and only verified installers are ever considered.
 *
 * Coverage rules (documented in docs/SOLARekta_Implementation_Status.md):
 *  1. An area equal to the site's city or municipality matches ("city").
 *  2. An area equal to the site's province matches ("province").
 *  3. An area equal to the site's region (from the location table) matches ("region").
 *  4. "Nationwide" / "Philippines" style entries match everywhere ("nationwide").
 * Normalisation lowercases, removes accents and punctuation, and drops a leading
 * "City of" / "Municipality of", so "City of Manila" = "Manila". A trailing "City" is
 * kept: Quezon City and Cebu City are not the provinces Quezon and Cebu.
 * Aliases cover NCR / Metro Manila.
 */

export type MatchBasis = "city" | "province" | "region" | "nationwide";

const NATIONWIDE = new Set(["nationwide", "philippines", "all philippines", "whole philippines", "anywhere in the philippines"]);
const ALIASES: Record<string, string> = {
  ncr: "metro manila",
  "national capital region": "metro manila",
  "metro manila ncr": "metro manila",
  mm: "metro manila",
};

export function normalizeArea(value: string): string {
  let v = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  v = v.replace(/^(city|municipality) of /, "");
  // "X City" stays distinct from "X": e.g. Quezon City (a city) vs Quezon (a province).
  v = ALIASES[v] ?? v;
  return v;
}

export interface SiteArea {
  city: string;
  province?: string | null;
}

export function matchServiceArea(areas: string[], site: SiteArea): { basis: MatchBasis; area: string } | null {
  const city = normalizeArea(site.city);
  const location = findLocation(site.city);
  const province = normalizeArea(site.province || location?.province || "");
  const region = location ? normalizeArea(location.region) : "";

  let best: { basis: MatchBasis; area: string } | null = null;
  const rank: Record<MatchBasis, number> = { city: 0, province: 1, region: 2, nationwide: 3 };
  for (const raw of areas) {
    const area = normalizeArea(raw);
    if (!area) continue;
    let basis: MatchBasis | null = null;
    if (area === city) basis = "city";
    else if (province && area === province) basis = "province";
    else if (region && area === region) basis = "region";
    else if (NATIONWIDE.has(area)) basis = "nationwide";
    if (basis && (!best || rank[basis] < rank[best.basis])) best = { basis, area: raw };
  }
  return best;
}

export interface EligibleInstaller {
  installer: InstallerRow;
  areas: string[];
  basis: MatchBasis;
  matchedArea: string;
}

/** Verified installers whose declared service areas cover the site, best match first. */
export function eligibleInstallers(installers: InstallerRow[], site: SiteArea): EligibleInstaller[] {
  const rank: Record<MatchBasis, number> = { city: 0, province: 1, region: 2, nationwide: 3 };
  return installers
    .filter((installer) => installer.verification_status === "verified")
    .map((installer) => {
      const areas = parseServiceAreas(installer.service_areas_json);
      const match = matchServiceArea(areas, site);
      return match ? { installer, areas, basis: match.basis, matchedArea: match.area } : null;
    })
    .filter((x): x is EligibleInstaller => x !== null)
    .sort((a, b) => rank[a.basis] - rank[b.basis] || a.installer.business_name.localeCompare(b.installer.business_name));
}

export const MATCH_LABEL: Record<MatchBasis, string> = {
  city: "Serves your city",
  province: "Serves your province",
  region: "Serves your region",
  nationwide: "Serves nationwide",
};

export const MAX_PROVIDERS_PER_REQUEST = 5;

export type SelectionCheck =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/**
 * Server-side check of a provider selection. Duplicates are collapsed; every id must be
 * an eligible (verified, in-area) provider; at least one and at most five are allowed.
 */
export function checkProviderSelection(selected: string[], eligibleIds: string[]): SelectionCheck {
  const ids = Array.from(new Set(selected.filter((id) => typeof id === "string" && id.length > 0)));
  if (eligibleIds.length === 0) {
    return { ok: false, error: "No verified provider covers your area yet, so a request can’t be sent. Your estimate stays saved." };
  }
  if (ids.length === 0) return { ok: false, error: "Choose at least one provider." };
  if (ids.length > MAX_PROVIDERS_PER_REQUEST) {
    return { ok: false, error: `Choose up to ${MAX_PROVIDERS_PER_REQUEST} providers.` };
  }
  const allowed = new Set(eligibleIds);
  if (ids.some((id) => !allowed.has(id))) {
    return { ok: false, error: "One of the selected providers does not serve your area. Refresh the page and choose again." };
  }
  return { ok: true, ids };
}
