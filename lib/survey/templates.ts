/**
 * Versioned, configuration-driven survey templates. Each survey stores the template id and
 * version it was created with, so old surveys keep rendering against their original checklist.
 * To change a checklist, add a new version to TEMPLATES rather than editing a published one.
 * Pure — used by server and client.
 */
import { CONNECTION_ARRANGEMENTS, type EvidenceCategory } from "@/lib/survey/config";

export type SurveyType = "residential" | "commercial";
export type ItemStatus = "not_assessed" | "completed" | "issue" | "na";

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  not_assessed: "Not assessed",
  completed: "Completed",
  issue: "Issue found",
  na: "Not applicable",
};

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "multiselect" | "yesno";
  unit?: string;
  options?: FieldOption[];
  help?: string;
  min?: number;
  max?: number;
  /** Shown as a warning when the item is Completed but this value is empty. */
  recommended?: boolean;
}

export interface ChecklistItemDef {
  id: string;
  label: string;
  help?: string;
  /** Must not be left "Not assessed" at submission. */
  required?: boolean;
  /** "Not applicable" needs a reason (default true). "Issue found" always needs one. */
  naNeedsReason?: boolean;
  fields?: FieldDef[];
  /** Suggested evidence category for the item's "Add photo" button. */
  evidence?: EvidenceCategory;
  /** This checklist item is a required photo (photo list sections). */
  photo?: boolean;
}

export interface SectionDef {
  id: string;
  title: string;
  description: string;
  items: ChecklistItemDef[];
  /** Show the roof-plane editor in this section. */
  roofPlanes?: boolean;
  /** Per-plane shading observations (commercial). */
  planeShading?: boolean;
  /** Section is for engineer review; findings are observations only. */
  engineerReview?: boolean;
}

export interface TemplateDef {
  id: SurveyType;
  version: string;
  title: string;
  code: string;
  sections: SectionDef[];
}

const yes = (key: string, label: string, help?: string): FieldDef => ({ key, label, type: "yesno", help });
const opts = (...labels: string[]): FieldOption[] => labels.map((l) => ({ value: l.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), label: l }));

const ORIENTATION = opts("North", "North-east", "East", "South-east", "South", "South-west", "West", "North-west", "Flat / no tilt");

const SHADING_ITEMS: ChecklistItemDef[] = [
  {
    id: "shade_method",
    label: "Shading assessment method",
    help: "How shading was assessed. Attach screenshots or reports from the tool used.",
    required: true,
    evidence: "shading",
    fields: [
      { key: "method", label: "Method", type: "select", options: opts("Visual observation", "Sun-path app (e.g. Sun Surveyor)", "Shading analysis tool (e.g. SunEye)", "Satellite imagery review", "Other"), recommended: true },
      { key: "tool", label: "Tool or app name", type: "text" },
    ],
  },
  {
    id: "shade_times",
    label: "Morning, noon and afternoon shading",
    help: "Describe shade on the usable roof at each time of day.",
    required: true,
    fields: [
      { key: "morning", label: "Morning", type: "text" },
      { key: "noon", label: "Noon", type: "text" },
      { key: "afternoon", label: "Afternoon", type: "text" },
    ],
  },
  { id: "shade_sources", label: "Trees, neighbouring buildings and parapets", required: true, evidence: "shading", fields: [{ key: "sources", label: "Shading sources noted", type: "textarea" }] },
  { id: "shade_future", label: "Potential future shading or construction", help: "Growing trees, planned buildings next door, the client's own expansion.", fields: [{ key: "notes", label: "What could shade the roof later", type: "textarea" }] },
];

const RESIDENTIAL: TemplateDef = {
  id: "residential",
  version: "res-2026.11.1",
  title: "Residential rooftop survey",
  code: "RES",
  sections: [
    {
      id: "site",
      title: "Site and access",
      description: "Where the house is and how a crew would get onto the roof.",
      items: [
        { id: "site_pin", label: "Exact location pin saved", help: "Save the GPS pin of the building itself, not just the street name. Recorded in Visit details.", required: true },
        { id: "site_frontage_photo", label: "Building frontage photo taken", required: true, evidence: "site_frontage" },
        { id: "site_expansion", label: "Planned second floor or future expansion asked", required: true, fields: [yes("planned", "Expansion planned?"), { key: "details", label: "Details", type: "text" }] },
        { id: "site_offline_map", label: "Offline map prepared", help: "Map downloaded for areas with weak signal.", naNeedsReason: false },
        { id: "site_access", label: "Ladder, access and parking checked", required: true, evidence: "access_safety", fields: [{ key: "notes", label: "Access observations", type: "textarea" }] },
      ],
    },
    {
      id: "roof",
      title: "Roof",
      description: "Material, condition and each usable roof plane.",
      roofPlanes: true,
      items: [
        { id: "roof_material", label: "Roof material", required: true, evidence: "roof_condition", fields: [{ key: "material", label: "Material", type: "select", options: opts("GI sheet", "Tile", "Concrete", "Shingle", "Other"), recommended: true }, { key: "other", label: "If other, describe", type: "text" }] },
        { id: "roof_age", label: "Roof age", required: true, fields: [{ key: "years", label: "Approximate age", type: "number", unit: "years", min: 0, max: 150, recommended: true }] },
        { id: "roof_planes_measured", label: "Usable area, pitch and orientation per plane", help: "Add each plane below with its own measurements.", required: true },
        { id: "roof_condition", label: "Roof condition: rust, leaks, ponding, sagging", required: true, evidence: "roof_condition", fields: [{ key: "observed", label: "Observed", type: "multiselect", options: opts("Rust", "Leaks", "Ponding", "Sagging", "Cracks", "None observed") }] },
        { id: "roof_rafters", label: "Rafter size and spacing", help: "Only if measured safely.", fields: [{ key: "size", label: "Rafter size", type: "text" }, { key: "spacing", label: "Spacing", type: "number", unit: "mm", min: 0, max: 5000 }] },
        { id: "roof_attic", label: "Attic access checked", fields: [yes("available", "Attic access available?")] },
        { id: "roof_obstructions", label: "Obstructions: water tank, antenna, vents, skylights", required: true, evidence: "shading", fields: [{ key: "items", label: "Present", type: "multiselect", options: opts("Water tank", "Antenna", "Vents", "Skylight", "None") }] },
        { id: "roof_fixing", label: "Proposed fixing method", required: true, fields: [{ key: "method", label: "Method", type: "select", options: opts("Penetrating", "Ballast", "Undetermined"), recommended: true }] },
      ],
    },
    { id: "shading", title: "Shading", description: "What blocks the sun, and when.", items: SHADING_ITEMS },
    {
      id: "electrical",
      title: "Electrical",
      description: "Record actual readings separately from whether the item was checked.",
      items: [
        { id: "elec_main_breaker", label: "Main breaker checked", required: true, evidence: "electrical", fields: [{ key: "rating", label: "Main breaker rating", type: "number", unit: "A", min: 1, max: 4000, recommended: true }] },
        { id: "elec_panel", label: "Panel brand and spare slots", required: true, evidence: "electrical", fields: [{ key: "brand", label: "Panel brand", type: "text" }, { key: "spare", label: "Spare slots", type: "number", min: 0, max: 200 }] },
        { id: "elec_busbar", label: "Busbar rating", help: "Only if labelled or known.", fields: [{ key: "rating", label: "Busbar rating", type: "number", unit: "A", min: 1, max: 6000 }] },
        { id: "elec_service", label: "Service phase and connection", required: true, fields: [{ key: "phase", label: "Phase", type: "select", options: opts("Single-phase", "Three-phase"), recommended: true }, { key: "drop", label: "Service drop", type: "select", options: opts("Overhead", "Underground") }] },
        { id: "elec_meter", label: "Meter location and photo", required: true, evidence: "meter_bill", fields: [{ key: "location", label: "Meter location", type: "text" }] },
        { id: "elec_distance", label: "Roof-to-panel distance", required: true, fields: [{ key: "meters", label: "Distance", type: "number", unit: "m", min: 0, max: 2000, recommended: true }] },
        { id: "elec_cable_route", label: "Proposed cable route", required: true, evidence: "electrical", fields: [{ key: "route", label: "Route", type: "select", options: opts("Through attic", "Outside wall", "Conduit", "Other") }, { key: "notes", label: "Route notes", type: "text" }] },
        { id: "elec_daytime_loads", label: "Daytime loads", fields: [{ key: "loads", label: "Loads present", type: "multiselect", options: opts("Air conditioning", "EV charging", "Water pump", "Refrigeration", "Other") }, { key: "notes", label: "Notes", type: "text" }] },
        { id: "elec_bills", label: "Electricity bills and consumption history", required: true, evidence: "meter_bill", fields: [{ key: "months", label: "Months of history collected", type: "number", min: 0, max: 60 }] },
      ],
    },
    {
      id: "photos",
      title: "Required photos",
      description: "Tick each photo as you take it, and attach it to the item.",
      items: [
        { id: "ph_frontage", label: "Frontage and street", photo: true, required: true, evidence: "site_frontage" },
        { id: "ph_roof_material", label: "Roof material close-up", photo: true, required: true, evidence: "roof_condition" },
        { id: "ph_roof_planes", label: "Each roof plane", photo: true, required: true, evidence: "roof_overview" },
        { id: "ph_attic", label: "Attic or roof underside (where safely accessible)", photo: true, evidence: "roof_condition" },
        { id: "ph_meter", label: "Meter", photo: true, required: true, evidence: "meter_bill" },
        { id: "ph_panel", label: "Main panel and breaker labels", photo: true, required: true, evidence: "electrical" },
        { id: "ph_obstructions", label: "Obstructions", photo: true, evidence: "shading" },
        { id: "ph_inverter", label: "Proposed inverter location and cable route", photo: true, required: true, evidence: "electrical" },
        { id: "ph_access", label: "Access and ladder area", photo: true, evidence: "access_safety" },
      ],
    },
    {
      id: "client",
      title: "Client and documents",
      description: "Who decides, what they want and what happens next.",
      items: [
        { id: "cl_decision_maker", label: "Decision maker confirmed", required: true, fields: [{ key: "name", label: "Decision maker", type: "text" }] },
        { id: "cl_net_metering", label: "Net-metering interest confirmed", required: true, fields: [{ key: "arrangement", label: "Intended arrangement", type: "select", options: CONNECTION_ARRANGEMENTS }] },
        { id: "cl_roof_warranty", label: "Roof warranty asked", fields: [yes("active", "Roof under warranty?"), { key: "details", label: "Details", type: "text" }] },
        { id: "cl_bill", label: "Electricity bill collected", required: true, evidence: "meter_bill" },
        { id: "cl_next_step", label: "Next step agreed", required: true, fields: [{ key: "step", label: "Agreed next step", type: "text", recommended: true }] },
      ],
    },
  ],
};

const COMMERCIAL: TemplateDef = {
  id: "commercial",
  version: "com-2026.11.1",
  title: "Commercial rooftop survey",
  code: "COM",
  sections: [
    {
      id: "site",
      title: "Site and access",
      description: "Contacts, roof access, logistics and operating constraints.",
      items: [
        { id: "site_pin", label: "Exact location pin saved", help: "Recorded in Visit details.", required: true },
        { id: "site_contacts", label: "Site and facilities contacts", required: true, fields: [{ key: "site", label: "Site contact", type: "text" }, { key: "facilities", label: "Facilities contact", type: "text" }] },
        { id: "site_roof_access", label: "Roof access checked", required: true, evidence: "access_safety", fields: [{ key: "via", label: "Access via", type: "select", options: opts("Hatch", "Stairs", "Fixed ladder", "Portable ladder", "Other") }] },
        { id: "site_offline_map", label: "Offline map prepared", naNeedsReason: false },
        { id: "site_logistics", label: "Truck and crane access checked", required: true, evidence: "access_safety", fields: [{ key: "notes", label: "Logistics notes", type: "textarea" }] },
        { id: "site_hours", label: "Operating hours and shutdown windows", required: true, fields: [{ key: "hours", label: "Operating hours", type: "text" }, { key: "shutdown", label: "Possible shutdown windows", type: "text" }] },
      ],
    },
    {
      id: "roof",
      title: "Roof",
      description: "Roof type, maintenance, drainage and each usable plane.",
      roofPlanes: true,
      items: [
        { id: "roof_material", label: "Roof type", required: true, evidence: "roof_condition", fields: [{ key: "material", label: "Type", type: "select", options: opts("Concrete flat", "Metal deck", "Membrane", "GI", "Other"), recommended: true }, { key: "other", label: "If other, describe", type: "text" }] },
        { id: "roof_age", label: "Roof age and last maintenance", required: true, fields: [{ key: "years", label: "Approximate age", type: "number", unit: "years", min: 0, max: 150, recommended: true }, { key: "maintenance", label: "Last maintenance", type: "text" }] },
        { id: "roof_planes_measured", label: "Usable area, pitch and orientation per plane", required: true },
        { id: "roof_membrane", label: "Membrane condition, ponding, leaks and drainage", required: true, evidence: "roof_condition", fields: [{ key: "observed", label: "Observed", type: "multiselect", options: opts("Membrane damage", "Ponding", "Leaks", "Blocked drains", "None observed") }, { key: "layers", label: "Membrane layers", type: "number", min: 0, max: 20 }] },
        { id: "roof_warranty", label: "Roof warranty remaining", fields: [yes("active", "Under warranty?"), { key: "expires", label: "Expiry or remaining term", type: "text" }] },
        { id: "roof_obstructions", label: "HVAC, vents, parapets, skylights and water tanks", required: true, evidence: "shading", fields: [{ key: "items", label: "Present", type: "multiselect", options: opts("HVAC units", "Vents", "Parapets", "Skylights", "Water tanks", "None") }] },
        { id: "roof_fixing", label: "Proposed mounting", required: true, fields: [{ key: "method", label: "Method", type: "select", options: opts("Ballast", "Penetrating", "Undetermined"), recommended: true }] },
      ],
    },
    {
      id: "shading",
      title: "Shading",
      description: "Shading per roof plane, plus rooftop equipment and future changes.",
      planeShading: true,
      items: [
        SHADING_ITEMS[0],
        { id: "shade_hvac", label: "HVAC and parapet shading", required: true, evidence: "shading", fields: [{ key: "notes", label: "Observations", type: "textarea" }] },
        { id: "shade_drone", label: "Drone images or existing 3D model", help: "Attach files if used. Optional.", naNeedsReason: false, evidence: "roof_overview" },
        { id: "shade_future", label: "Future building expansion", fields: [{ key: "notes", label: "What could shade the roof later", type: "textarea" }] },
      ],
    },
    {
      id: "electrical",
      title: "Electrical",
      description: "Record verified values only; leave unknown values blank.",
      items: [
        { id: "elec_sanctioned", label: "Sanctioned load", help: "If available from the bill or utility.", fields: [{ key: "kw", label: "Sanctioned load", type: "number", unit: "kW", min: 0, max: 100000 }] },
        { id: "elec_transformer", label: "Transformer capacity and available capacity", help: "Only record values you verified.", evidence: "electrical", fields: [{ key: "kva", label: "Transformer capacity", type: "number", unit: "kVA", min: 0, max: 200000 }, { key: "available", label: "Available capacity", type: "number", unit: "kVA", min: 0, max: 200000 }, yes("verified", "Values verified with documents or utility?")] },
        { id: "elec_service", label: "Connection phase", required: true, fields: [{ key: "phase", label: "Phase", type: "select", options: opts("Single-phase", "Three-phase"), recommended: true }] },
        { id: "elec_switchboard", label: "Main switchboard location and photo", required: true, evidence: "electrical", fields: [{ key: "location", label: "Location", type: "text" }] },
        { id: "elec_inverter_room", label: "Inverter room or installation location", required: true, evidence: "electrical", fields: [{ key: "location", label: "Location", type: "text" }] },
        { id: "elec_cable_route", label: "Cable tray and route to switchroom", required: true, evidence: "electrical", fields: [{ key: "route", label: "Route", type: "text" }, { key: "meters", label: "Approximate length", type: "number", unit: "m", min: 0, max: 5000 }] },
        { id: "elec_earthing", label: "Earthing location and observations", required: true, evidence: "electrical", fields: [{ key: "notes", label: "Observations", type: "text" }] },
        { id: "elec_bills", label: "Twelve-month bills and demand data", required: true, evidence: "meter_bill", fields: [{ key: "months", label: "Months collected", type: "number", min: 0, max: 60 }, yes("demand", "Demand data available?")] },
      ],
    },
    {
      id: "structural",
      title: "Structural observations — for engineer review",
      description: "Observations only. Nothing here is a structural verification; a qualified engineer decides.",
      engineerReview: true,
      items: [
        { id: "st_members", label: "Purlins, trusses and decking condition", required: true, evidence: "roof_condition", fields: [{ key: "notes", label: "Observed condition", type: "textarea" }] },
        { id: "st_corrosion", label: "Corrosion, sagging and deflection", required: true, evidence: "roof_condition", fields: [{ key: "observed", label: "Observed", type: "multiselect", options: opts("Corrosion", "Sagging", "Deflection", "None observed") }] },
        { id: "st_loading", label: "Proposed additional loading assumptions", help: "Record the assumption and where it came from. A generic figure is not a verification.", fields: [{ key: "assumption", label: "Assumption", type: "text" }, { key: "source", label: "Source of the assumption", type: "text" }] },
        { id: "st_wind", label: "Wind / typhoon exposure observations", required: true, fields: [{ key: "notes", label: "Exposure notes", type: "textarea" }] },
        { id: "st_mounting", label: "Mounting suitability questions", help: "Questions for the engineer about ballast vs penetrating mounting.", fields: [{ key: "questions", label: "Questions", type: "textarea" }] },
        { id: "st_drawings", label: "Structural drawings", required: true, fields: [{ key: "state", label: "Status", type: "select", options: opts("Requested", "Received", "Not available") }] },
        { id: "st_review_required", label: "Qualified structural review required?", required: true, fields: [{ key: "required", label: "Structural review required", type: "select", options: opts("Yes", "No", "Unsure"), recommended: true }] },
      ],
    },
    {
      id: "photos",
      title: "Photo list",
      description: "Tick each photo as you take it, and attach it to the item.",
      items: [
        { id: "ph_frontage", label: "Frontage and street", photo: true, required: true, evidence: "site_frontage" },
        { id: "ph_roof_planes", label: "Each roof plane", photo: true, required: true, evidence: "roof_overview" },
        { id: "ph_roof_material", label: "Roof material or membrane close-up", photo: true, required: true, evidence: "roof_condition" },
        { id: "ph_structure", label: "Underside / structure", photo: true, evidence: "roof_condition" },
        { id: "ph_hvac", label: "HVAC and obstructions", photo: true, evidence: "shading" },
        { id: "ph_meter", label: "Meter", photo: true, required: true, evidence: "meter_bill" },
        { id: "ph_switchgear", label: "Main panel, switchgear and transformer (where accessible)", photo: true, required: true, evidence: "electrical" },
        { id: "ph_inverter", label: "Inverter location and cable route", photo: true, required: true, evidence: "electrical" },
        { id: "ph_access", label: "Access and safety conditions", photo: true, evidence: "access_safety" },
      ],
    },
    {
      id: "client",
      title: "Client and documents",
      description: "Decision makers, documents requested and the agreed next step.",
      items: [
        { id: "cl_decision_maker", label: "Decision makers identified", required: true, fields: [{ key: "who", label: "Decision makers", type: "multiselect", options: opts("Owner", "Facilities", "Administration", "Board") }] },
        { id: "cl_sld", label: "Electrical single-line diagram", required: true, fields: [{ key: "state", label: "Status", type: "select", options: opts("Requested", "Received", "Not available") }] },
        { id: "cl_structural_drawings", label: "Structural drawings", required: true, fields: [{ key: "state", label: "Status", type: "select", options: opts("Requested", "Received", "Not available") }] },
        { id: "cl_roof_plan", label: "Roof plan", fields: [{ key: "state", label: "Status", type: "select", options: opts("Requested", "Received", "Not available") }] },
        { id: "cl_connection", label: "Intended connection / export arrangement", required: true, fields: [{ key: "arrangement", label: "Arrangement", type: "select", options: CONNECTION_ARRANGEMENTS }] },
        { id: "cl_next_step", label: "Next step agreed", required: true, fields: [{ key: "step", label: "Agreed next step", type: "text", recommended: true }] },
      ],
    },
  ],
};

/** Registry of every published template version. Never remove a version that surveys use. */
export const TEMPLATES: TemplateDef[] = [RESIDENTIAL, COMMERCIAL];

export function currentTemplate(type: SurveyType): TemplateDef {
  return type === "residential" ? RESIDENTIAL : COMMERCIAL;
}

export function getTemplate(type: SurveyType, version: string): TemplateDef {
  return TEMPLATES.find((t) => t.id === type && t.version === version) ?? currentTemplate(type);
}

export function allItems(template: TemplateDef): (ChecklistItemDef & { sectionId: string })[] {
  return template.sections.flatMap((s) => s.items.map((i) => ({ ...i, sectionId: s.id })));
}

export const ORIENTATION_OPTIONS = ORIENTATION;
