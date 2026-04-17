import type { DirectCostKey } from "./library";

/**
 * A correction applied to a specific building block's direct cost columns.
 * Phase 2 will populate these; Phase 1 ships an empty-overlay no-op.
 */
export type OverlayCorrectionType = "multiplier" | "offset";
export type OverlayConfidence = "low" | "medium" | "high";

export interface OverlayCorrection {
  library_block_id: number;
  correction_type: OverlayCorrectionType;
  cost_columns: DirectCostKey[];
  factor: number;         // multiplier or additive offset depending on type
  confidence: OverlayConfidence;
  sample_size?: number;
  notes?: string;
}

export interface Overlay {
  id: string;
  name: string;
  library_version: string;
  source_description: string;
  corrections: OverlayCorrection[];
}

export function emptyOverlay(library_version: string): Overlay {
  return {
    id: "empty",
    name: "Empty overlay (no corrections)",
    library_version,
    source_description: "Phase 1 no-op scaffold",
    corrections: [],
  };
}
