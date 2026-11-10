import { describe, expect, it } from "vitest";
import { eligibleInstallers, matchServiceArea, normalizeArea } from "@/lib/matching";
import type { InstallerRow } from "@/lib/types";

function installer(id: string, areas: string[], status: InstallerRow["verification_status"] = "verified"): InstallerRow {
  return {
    id,
    user_id: `u-${id}`,
    business_name: `Installer ${id}`,
    slug: id,
    about: null,
    website: null,
    phone: null,
    service_areas_json: JSON.stringify(areas),
    verification_status: status,
    verified_at: null,
    license_no: null,
    years_experience: 3,
    created_at: "t",
    updated_at: "t",
  } as InstallerRow;
}

describe("service-area matching", () => {
  it("normalises accents, punctuation and 'City of' prefixes", () => {
    expect(normalizeArea("  City of Manila ")).toBe("manila");
    expect(normalizeArea("Dasmariñas")).toBe("dasmarinas");
    expect(normalizeArea("NCR")).toBe("metro manila");
    expect(normalizeArea("Lapu-Lapu")).toBe("lapu lapu");
  });

  it("matches city, province, region and nationwide coverage exactly", () => {
    expect(matchServiceArea(["Quezon City"], { city: "Quezon City" })?.basis).toBe("city");
    expect(matchServiceArea(["Metro Manila"], { city: "Pasig" })?.basis).toBe("province");
    expect(matchServiceArea(["NCR"], { city: "Pasig" })?.basis).toBe("province");
    expect(matchServiceArea(["Central Visayas"], { city: "Cebu City" })?.basis).toBe("region");
    expect(matchServiceArea(["Nationwide"], { city: "Laoag" })?.basis).toBe("nationwide");
    expect(matchServiceArea(["Cebu"], { city: "Cebu City" })?.basis).toBe("province");
  });

  it("does not use brittle substring matching", () => {
    expect(matchServiceArea(["Manila"], { city: "Quezon City", province: "Metro Manila" })).toBeNull();
    expect(matchServiceArea(["San"], { city: "San Fernando" })).toBeNull();
    expect(matchServiceArea(["Quezon"], { city: "Quezon City" })).toBeNull();
  });

  it("uses a user-entered province for cities missing from the table", () => {
    expect(matchServiceArea(["Bulacan"], { city: "Malolos", province: "Bulacan" })?.basis).toBe("province");
    expect(matchServiceArea(["Bulacan"], { city: "Malolos" })).toBeNull();
  });

  it("excludes out-of-area and unverified installers and ranks closer matches first", () => {
    const list = [
      installer("a", ["Cebu City"]),
      installer("b", ["Metro Manila"]),
      installer("c", ["Pasig"]),
      installer("d", ["Pasig"], "pending"),
      installer("e", ["Nationwide"], "suspended"),
    ];
    const eligible = eligibleInstallers(list, { city: "Pasig" });
    expect(eligible.map((e) => e.installer.id)).toEqual(["c", "b"]);
    expect(eligible[0].basis).toBe("city");
    expect(eligibleInstallers(list, { city: "Davao City" })).toEqual([]);
  });
});

import { checkProviderSelection } from "@/lib/matching";

describe("provider selection limits", () => {
  const eligible = ["a", "b", "c", "d", "e", "f"];
  it("accepts one to five eligible providers and collapses duplicates", () => {
    expect(checkProviderSelection(["a", "a", "b"], eligible)).toEqual({ ok: true, ids: ["a", "b"] });
    expect(checkProviderSelection(["a", "b", "c", "d", "e"], eligible).ok).toBe(true);
  });
  it("rejects more than five, none, out-of-area ids and empty eligibility", () => {
    expect(checkProviderSelection(["a", "b", "c", "d", "e", "f"], eligible).ok).toBe(false);
    expect(checkProviderSelection([], eligible).ok).toBe(false);
    expect(checkProviderSelection(["zzz"], eligible).ok).toBe(false);
    const none = checkProviderSelection(["a"], []);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error).toMatch(/No verified provider covers your area/);
  });
});
