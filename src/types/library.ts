export const DIRECT_COST_KEYS = [
  "PL", "CS", "EW", "SS", "DS", "TC", "PM", "EP", "EO",
] as const;
export type DirectCostKey = (typeof DIRECT_COST_KEYS)[number];
export type DirectCosts = Record<DirectCostKey, number>;

export const INDIRECT_COST_KEYS = [
  "PD", "WD", "LE", "SCE", "PC", "INS",
] as const;
export type IndirectCostKey = (typeof INDIRECT_COST_KEYS)[number];
export type IndirectCosts = Record<IndirectCostKey, number>;

export const DIRECT_COST_LABELS: Record<DirectCostKey, string> = {
  PL: "Plant",
  CS: "Civil and Structural Works",
  EW: "Electrical Works",
  SS: "Secondary Systems",
  DS: "Design & Survey",
  TC: "Testing & Commissioning",
  PM: "Contractor Project Management & Overheads",
  EP: "Easement / Property Costs",
  EO: "Environmental Offset Costs",
};

export const INDIRECT_COST_LABELS: Record<IndirectCostKey, string> = {
  PD: "Project Development",
  WD: "Works Delivery",
  LE: "Land and Environment",
  SCE: "Stakeholder and Community Engagement",
  PC: "Procurement Costs",
  INS: "Insurance",
};

export type TopCategory = "Station" | "Overhead line" | "Underground Cable";
export const TOP_CATEGORIES: readonly TopCategory[] = [
  "Station",
  "Overhead line",
  "Underground Cable",
] as const;

export interface BuildingBlock {
  id: number;
  cat: TopCategory;
  scat: string;
  ttl: string;
  desc: string;
  nt: string;
  kv: string;
  un: string;
  cost: DirectCosts;
  tbbc: number;
}

export interface Adjustment {
  id: number;
  cat: string;   // "Station project attribute" | "Overhead line project attribute" | "Underground cable project attribute"
  scat: string;
  ttl: string;
  desc: string;
  nt: string;
  factor: DirectCosts;
}

export interface Risk {
  id: number;
  cat: string;   // "<top> known risk" | "<top> unknown risk"
  scat: string;
  ttl: string;
  desc: string;
  nt: string;
  factor: DirectCosts;
}

export interface IndirectCost {
  id: number;
  cat: string;
  scat: string;
  ttl: string;
  desc: string;
  nt: string;
  factor: IndirectCosts;
  tic: number;
}

export interface LibraryMetadata {
  library_version: string;
  source_file: string;
  currency_year: number;
  currency: "AUD";
  extracted_at: string;
  source_description: string;
  content_hash: string;
  row_counts: Record<string, number>;
}

export interface Library {
  metadata: LibraryMetadata;
  building_blocks: BuildingBlock[];
  adjustments: Adjustment[];
  risks: Risk[];
  indirect_costs: IndirectCost[];
}

export function topCategoryFromAdjustmentCat(cat: string): TopCategory | null {
  if (cat === "Station project attribute") return "Station";
  if (cat === "Overhead line project attribute") return "Overhead line";
  if (cat === "Underground cable project attribute") return "Underground Cable";
  return null;
}

export function topCategoryFromRiskCat(cat: string): TopCategory | null {
  if (cat.startsWith("Station")) return "Station";
  if (cat.startsWith("Overhead line")) return "Overhead line";
  if (cat.startsWith("Underground cable")) return "Underground Cable";
  return null;
}

export function riskKindFromRiskCat(cat: string): "known" | "unknown" | null {
  if (cat.endsWith("unknown risk")) return "unknown";
  if (cat.endsWith("known risk")) return "known";
  return null;
}
