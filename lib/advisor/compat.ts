/**
 * Battery–inverter compatibility. Pure.
 *
 * "Verified" only when a reviewed listing names the other model in its manufacturer
 * compatibility list. Everything else is an unverified assessment: we report what the
 * listed specs show and never approve compatibility from voltage alone.
 */
import { normalizeToken, voltageClass } from "@/lib/advisor/specs";
import type { PriceRecord } from "@/lib/advisor/match";

export type CheckResult = "ok" | "conflict" | "unknown";

export interface CompatibilityCheck {
  label: string;
  result: CheckResult;
  detail: string;
}

export type CompatibilityOutcome =
  | { status: "need_models"; message: string; missing: ("battery" | "inverter")[]; notFound: string[] }
  | {
      status: "verified" | "unverified" | "conflict";
      battery: PriceRecord;
      inverter: PriceRecord;
      checks: CompatibilityCheck[];
      verdict: string;
      evidence: { listing: PriceRecord; statedModels: string[] } | null;
    };

const listed = (record: PriceRecord, otherModel: string) =>
  (record.specs.compatibleModels ?? []).some((m) => normalizeToken(m) === normalizeToken(otherModel));

export function assessCompatibility(input: { battery?: PriceRecord | null; inverter?: PriceRecord | null; notFound?: string[] }): CompatibilityOutcome {
  const { battery, inverter } = input;
  if (!battery || !inverter) {
    const missing: ("battery" | "inverter")[] = [];
    if (!battery) missing.push("battery");
    if (!inverter) missing.push("inverter");
    const notFound = input.notFound ?? [];
    return {
      status: "need_models",
      missing,
      notFound,
      message: `To check compatibility we need the exact ${missing.join(" and ")} model${missing.length > 1 ? "s" : ""}${
        notFound.length ? `. We could not find ${notFound.join(", ")} in the reviewed catalogue` : ""
      }. Voltage alone is not enough to confirm compatibility.`,
    };
  }

  const evidenceListing = listed(battery, inverter.model) ? battery : listed(inverter, battery.model) ? inverter : null;
  const checks: CompatibilityCheck[] = [];

  checks.push(
    evidenceListing
      ? { label: "Manufacturer compatibility list", result: "ok", detail: `${evidenceListing.brand} ${evidenceListing.model} lists ${evidenceListing === battery ? inverter.model : battery.model} as compatible.` }
      : { label: "Manufacturer compatibility list", result: "unknown", detail: "Neither listing names the other model as compatible." },
  );

  const type = inverter.specs.inverterType;
  checks.push(
    !type
      ? { label: "Inverter accepts a battery", result: "unknown", detail: "The inverter type is not stated." }
      : type === "grid_tie"
        ? { label: "Inverter accepts a battery", result: "conflict", detail: "This is a grid-tie inverter. It has no battery input; a hybrid or off-grid inverter (or an AC-coupled charger) is needed." }
        : { label: "Inverter accepts a battery", result: "ok", detail: `${type === "hybrid" ? "Hybrid" : "Off-grid"} inverter with a battery input.` },
  );

  const bv = battery.specs.nominalVoltageV;
  const iv = inverter.specs.batteryVoltageV;
  checks.push(
    !bv || !iv
      ? { label: "Battery voltage", result: "unknown", detail: `${!bv ? "Battery" : "Inverter battery-input"} voltage is not stated.` }
      : voltageClass(bv) === voltageClass(iv)
        ? { label: "Battery voltage", result: "ok", detail: `Both in the ${voltageClass(bv)} class (${bv} V battery, ${iv} V inverter input). This alone does not confirm compatibility.` }
        : { label: "Battery voltage", result: "conflict", detail: `${bv} V battery and ${iv} V inverter input are in different voltage classes.` },
  );

  const bc = battery.specs.communication ?? [];
  const ic = inverter.specs.communication ?? [];
  const shared = bc.filter((p) => ic.some((o) => normalizeToken(o) === normalizeToken(p)));
  checks.push(
    !bc.length || !ic.length
      ? { label: "BMS communication", result: "unknown", detail: "Communication protocols (CAN / RS485) are not listed for both." }
      : shared.length
        ? { label: "BMS communication", result: "ok", detail: `Both list ${shared.join(", ")}. The protocol version and settings still need confirming.` }
        : { label: "BMS communication", result: "conflict", detail: `Battery lists ${bc.join(", ")}; inverter lists ${ic.join(", ")}.` },
  );

  const conflict = checks.some((c) => c.result === "conflict");
  if (evidenceListing && !conflict) {
    return {
      status: "verified",
      battery,
      inverter,
      checks,
      evidence: { listing: evidenceListing, statedModels: evidenceListing.specs.compatibleModels ?? [] },
      verdict: `Listed as compatible by the manufacturer (per the reviewed ${evidenceListing.brand} ${evidenceListing.model} listing). Your installer should still confirm firmware and settings.`,
    };
  }
  return {
    status: conflict ? "conflict" : "unverified",
    battery,
    inverter,
    checks,
    evidence: null,
    verdict: conflict
      ? "The listed specs show a conflict, so this pairing is unlikely to work as listed. Ask the supplier or a licensed installer before buying."
      : "Not verified. No conflicts appear in the listed specs, but compatibility is not confirmed. Ask the manufacturer or installer to confirm before buying.",
  };
}
