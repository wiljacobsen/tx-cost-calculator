import type {
  DirectCosts,
  IndirectCosts,
  TopCategory,
} from "./library";

export type EstimateClass = "Class 5b" | "Class 5a" | "Class 4" | "Class 3" | "Class 1/2";
export const ESTIMATE_CLASSES: readonly EstimateClass[] = [
  "Class 5b",
  "Class 5a",
  "Class 4",
  "Class 3",
  "Class 1/2",
] as const;

export type DeliveryModel = "EPC contract" | "D&C contract";
export type GreenfieldStatus = "Greenfield" | "Partly brownfield" | "Brownfield";
export type StakeholderSensitivity =
  | "Commensurate with land use"
  | "Sensitive"
  | "Highly sensitive";

export type ProjectSizeBand =
  | "Below $50 million"
  | "$50-$100 million"
  | "$100-$500 million"
  | "$500-$1000 million"
  | "$1000-$1500 million"
  | "Above $1500 million";

export const PROJECT_SIZE_BANDS: readonly ProjectSizeBand[] = [
  "Below $50 million",
  "$50-$100 million",
  "$100-$500 million",
  "$500-$1000 million",
  "$1000-$1500 million",
  "Above $1500 million",
] as const;

/** Project-level assumptions that cascade to every network element unless overridden. */
export interface ProjectAssumptions {
  jurisdiction: { state: string | null; subregion: string | null };
  delivery_model: DeliveryModel;
  project_size_band: ProjectSizeBand | "auto";  // "auto" = infer from direct cost
  greenfield_status: GreenfieldStatus;
  stakeholder_sensitivity: StakeholderSensitivity;
  macroeconomic: string;   // a TTL from "Macroeconomic influence" known-risk options
  market_activity: string; // a TTL from "Market activity" known-risk options
  estimate_class: EstimateClass;
}

/** A building block selected within a network element. References library by ID. */
export interface SelectedBuildingBlock {
  library_block_id: number;
  quantity: number;
}

export interface NetworkElement {
  id: string;
  name: string;
  description: string;
  category: TopCategory;
  building_blocks: SelectedBuildingBlock[];
  /** Override attribute selections. Keys are attribute SCATs, values are selected TTLs. */
  attribute_overrides: Record<string, string>;
  /** Override known-risk selections. Keys are known-risk SCATs, values are selected TTLs. */
  known_risk_overrides: Record<string, string>;
  /** Override unknown-risk selections. Keys are unknown-risk SCATs, values are selected TTLs. */
  unknown_risk_overrides: Record<string, string>;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  library_version: string;
  created_at: string;
  updated_at: string;
  version: number;
  project_assumptions: ProjectAssumptions;
  network_elements: NetworkElement[];
}

// --- Computed result shapes (from the calc engine) ---

export interface NetworkElementComputation {
  ne_id: string;
  baseline: DirectCosts;
  adjustment_factor: DirectCosts;
  known_risk_factor: DirectCosts;
  unknown_risk_factor: DirectCosts;
  adjusted_baseline: DirectCosts;
  known_risk_allowance: DirectCosts;
  unknown_risk_allowance: DirectCosts;
  total_by_category: DirectCosts;
  total: number;
  resolved: {
    attributes: Record<string, string>;
    known_risks: Record<string, string>;
    unknown_risks: Record<string, string>;
  };
}

export interface ProjectComputation {
  library_version: string;
  computed_at: string;
  network_elements: NetworkElementComputation[];
  project_direct: number;
  project_direct_by_category: DirectCosts;
  indirect_selections: {
    brownfield_band: { scat: string; ttl: string; ic_id: number | null };
    stakeholder: { ttl: string; ic_id: number | null };
    delivery_model: { ttl: string; ic_id: number | null };
  };
  indirect_by_category: IndirectCosts;
  total_indirect: number;
  project_total_central: number;
  project_total_low: number;
  project_total_high: number;
  range_multiplier: number;
  estimate_class: EstimateClass | "Mixed";
}
