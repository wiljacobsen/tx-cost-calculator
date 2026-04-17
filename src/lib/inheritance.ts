import type {
  Adjustment,
  Library,
  Risk,
  TopCategory,
} from "@/types/library";
import {
  topCategoryFromAdjustmentCat,
  topCategoryFromRiskCat,
  riskKindFromRiskCat,
} from "@/types/library";
import type {
  EstimateClass,
  NetworkElement,
  ProjectAssumptions,
} from "@/types/project";

/** Attribute SCATs that have a project-level inherited default. */
export const PROJECT_MAPPED_ATTRIBUTE_SCATS = [
  "Jurisdiction",
  "Contract delivery model",
  "Greenfield or brownfield",
] as const;

/** Known-risk SCATs that have a project-level inherited default. */
export const PROJECT_MAPPED_KNOWN_RISK_SCATS = [
  "Macroeconomic influence",
  "Market activity",
] as const;

/** All 4 unknown-risk SCATs are inherited from project.estimate_class. */
export const UNKNOWN_RISK_SCATS = [
  "Scope and technology risks",
  "Productivity and labour cost risks",
  "Plant procurement cost risks",
  "Project overhead risks",
] as const;

/** Attribute SCATs that never inherit (user must set per-NE). By top category. */
export const NE_ONLY_ATTRIBUTE_SCATS: Record<TopCategory, readonly string[]> = {
  Station: [
    "Project network element size",
    "Land Use",
    "Proportion of environmentally sensitive areas",
    "Location (regional/distance factors)",
    "Delivery timetable",
  ],
  "Overhead line": [
    "Project network element size",
    "Land Use",
    "Proportion of environmentally sensitive areas",
    "Location (regional/distance factors)",
    "Location wind loading zones",
    "Terrain",
    "Delivery timetable",
  ],
  "Underground Cable": [
    "Project network element size",
    "Proportion of environmentally sensitive areas",
    "Location (regional/distance factors)",
    "Delivery timetable",
  ],
};

/** Known-risk SCATs that never inherit (user must set per-NE). */
export const NE_ONLY_KNOWN_RISK_SCATS = [
  "Project complexity",
  "Compulsory acquisition",
  "Environmental offset risks",
  "Geotechnical findings",
  "Outage restrictions",
  "Weather delays",
  "Cultural heritage",
] as const;

function normalise(s: string): string {
  return s.trim().toLowerCase();
}

function findAdjustment(
  lib: Library,
  cat: TopCategory,
  scat: string,
  ttlOrPredicate: string | ((ttl: string) => boolean),
): Adjustment | null {
  const matchesTtl =
    typeof ttlOrPredicate === "function"
      ? ttlOrPredicate
      : (ttl: string) => normalise(ttl) === normalise(ttlOrPredicate);
  return (
    lib.adjustments.find(
      (a) =>
        topCategoryFromAdjustmentCat(a.cat) === cat &&
        a.scat === scat &&
        matchesTtl(a.ttl),
    ) ?? null
  );
}

function findRisk(
  lib: Library,
  cat: TopCategory,
  kind: "known" | "unknown",
  scat: string,
  ttl: string,
): Risk | null {
  return (
    lib.risks.find(
      (r) =>
        topCategoryFromRiskCat(r.cat) === cat &&
        riskKindFromRiskCat(r.cat) === kind &&
        r.scat === scat &&
        normalise(r.ttl) === normalise(ttl),
    ) ?? null
  );
}

/**
 * Resolve the effective attribute selections for a network element by
 * combining project assumptions with per-NE overrides. Returns a map from
 * attribute SCAT → selected TTL (only entries with a resolved selection).
 */
export function resolveAttributeSelections(
  ne: NetworkElement,
  assumptions: ProjectAssumptions,
): Record<string, string> {
  const out: Record<string, string> = { ...ne.attribute_overrides };

  // Jurisdiction: subregion wins if present; else state.
  if (!("Jurisdiction" in out)) {
    const pick = assumptions.jurisdiction.subregion ?? assumptions.jurisdiction.state;
    if (pick) out["Jurisdiction"] = pick;
  }

  // Contract delivery model
  if (!("Contract delivery model" in out)) {
    out["Contract delivery model"] = assumptions.delivery_model;
  }

  // Greenfield or brownfield (TTL text differs for Underground Cable; see findBrownfieldAttribute)
  if (!("Greenfield or brownfield" in out)) {
    out["Greenfield or brownfield"] = assumptions.greenfield_status;
  }

  return out;
}

/** Resolve known-risk TTL selections. SCATs without a selection default to "BAU". */
export function resolveKnownRiskSelections(
  ne: NetworkElement,
  assumptions: ProjectAssumptions,
): Record<string, string> {
  const out: Record<string, string> = { ...ne.known_risk_overrides };
  if (!("Macroeconomic influence" in out)) {
    out["Macroeconomic influence"] = assumptions.macroeconomic;
  }
  if (!("Market activity" in out)) {
    out["Market activity"] = assumptions.market_activity;
  }
  for (const scat of NE_ONLY_KNOWN_RISK_SCATS) {
    if (!(scat in out)) out[scat] = "BAU";
  }
  return out;
}

/** Resolve unknown-risk TTL selections. All 4 default to the project's estimate_class. */
export function resolveUnknownRiskSelections(
  ne: NetworkElement,
  assumptions: ProjectAssumptions,
): Record<string, string> {
  const out: Record<string, string> = { ...ne.unknown_risk_overrides };
  for (const scat of UNKNOWN_RISK_SCATS) {
    if (!(scat in out)) out[scat] = assumptions.estimate_class;
  }
  return out;
}

/** Look up each effective-attribute selection against the library. */
export function effectiveAttributes(
  lib: Library,
  ne: NetworkElement,
  assumptions: ProjectAssumptions,
): Adjustment[] {
  const selections = resolveAttributeSelections(ne, assumptions);
  const adj: Adjustment[] = [];
  for (const [scat, ttl] of Object.entries(selections)) {
    if (!ttl) continue;
    let a: Adjustment | null;
    if (scat === "Greenfield or brownfield" && ne.category === "Underground Cable") {
      const lower = normalise(ttl);
      a = findAdjustment(lib, ne.category, scat, (t) => normalise(t).startsWith(lower));
    } else if (scat === "Project network element size" && ne.category === "Station") {
      const lower = normalise(ttl);
      a = findAdjustment(lib, ne.category, scat, (t) => normalise(t).startsWith(lower) || normalise(t) === lower);
    } else {
      a = findAdjustment(lib, ne.category, scat, ttl);
    }
    if (a) adj.push(a);
  }
  return adj;
}

export function effectiveKnownRisks(
  lib: Library,
  ne: NetworkElement,
  assumptions: ProjectAssumptions,
): Risk[] {
  const selections = resolveKnownRiskSelections(ne, assumptions);
  const out: Risk[] = [];
  for (const [scat, ttl] of Object.entries(selections)) {
    const r = findRisk(lib, ne.category, "known", scat, ttl);
    if (r) out.push(r);
  }
  return out;
}

export function effectiveUnknownRisks(
  lib: Library,
  ne: NetworkElement,
  assumptions: ProjectAssumptions,
): Risk[] {
  const selections = resolveUnknownRiskSelections(ne, assumptions);
  const out: Risk[] = [];
  for (const [scat, ttl] of Object.entries(selections)) {
    const r = findRisk(lib, ne.category, "unknown", scat, ttl);
    if (r) out.push(r);
  }
  return out;
}

/** Derive the overall estimate class from unknown-risk overrides (or "Mixed"). */
export function inferEstimateClass(project: {
  project_assumptions: ProjectAssumptions;
  network_elements: NetworkElement[];
}): EstimateClass | "Mixed" {
  const base = project.project_assumptions.estimate_class;
  for (const ne of project.network_elements) {
    for (const scat of UNKNOWN_RISK_SCATS) {
      const override = ne.unknown_risk_overrides[scat];
      if (override && normalise(override) !== normalise(base)) return "Mixed";
    }
  }
  return base;
}
