/**
 * Pure TCD calculation engine. No state, no React, no I/O.
 *
 * Implements §4 of the Phase 1 spec: for each cost category C and network
 * element ne,
 *
 *   baseline_C         = Σ bb.quantity × library.block[bb.id].cost[C]
 *   adj_factor_C       = Σ library.adjustment[a].factor[C]   for effective a
 *   known_factor_C     = Σ library.risk[k].factor[C]          for effective k
 *   unknown_factor_C   = Σ library.risk[u].factor[C]          for effective u
 *   total_ne_C         = baseline_C × (1 + adj_C + known_C + unknown_C)
 *
 * project_direct = Σ ne total_ne(ne)
 * indirect_I = project_direct × Σ effective indirect_choices .factor[I]
 * project_total_central = project_direct + total_indirect
 * range = {5b: ±0.50, 5a: ±0.30, stricter classes ±0}
 */
import type {
  DirectCostKey,
  DirectCosts,
  IndirectCostKey,
  IndirectCosts,
  Library,
  BuildingBlock,
  IndirectCost,
} from "@/types/library";
import {
  DIRECT_COST_KEYS,
  INDIRECT_COST_KEYS,
} from "@/types/library";
import type {
  EstimateClass,
  NetworkElement,
  NetworkElementComputation,
  Project,
  ProjectAssumptions,
  ProjectComputation,
  ProjectSizeBand,
} from "@/types/project";
import { PROJECT_SIZE_BANDS } from "@/types/project";
import type { Overlay } from "@/types/overlay";
import {
  effectiveAttributes,
  effectiveKnownRisks,
  effectiveUnknownRisks,
  inferEstimateClass,
  resolveAttributeSelections,
  resolveKnownRiskSelections,
  resolveUnknownRiskSelections,
} from "./inheritance";
import { applyOverlayToBlock } from "./overlay";

export function zeroDirect(): DirectCosts {
  return DIRECT_COST_KEYS.reduce((o, k) => { o[k] = 0; return o; }, {} as DirectCosts);
}

export function zeroIndirect(): IndirectCosts {
  return INDIRECT_COST_KEYS.reduce((o, k) => { o[k] = 0; return o; }, {} as IndirectCosts);
}

function addDirect(a: DirectCosts, b: DirectCosts): DirectCosts {
  const r = {} as DirectCosts;
  for (const k of DIRECT_COST_KEYS) r[k] = a[k] + b[k];
  return r;
}

function scaleDirect(a: DirectCosts, s: number): DirectCosts {
  const r = {} as DirectCosts;
  for (const k of DIRECT_COST_KEYS) r[k] = a[k] * s;
  return r;
}

function multiplyDirect(a: DirectCosts, m: DirectCosts): DirectCosts {
  const r = {} as DirectCosts;
  for (const k of DIRECT_COST_KEYS) r[k] = a[k] * m[k];
  return r;
}

function sumDirect(a: DirectCosts): number {
  return DIRECT_COST_KEYS.reduce((s, k: DirectCostKey) => s + a[k], 0);
}

function onesPlus(a: DirectCosts): DirectCosts {
  const r = {} as DirectCosts;
  for (const k of DIRECT_COST_KEYS) r[k] = 1 + a[k];
  return r;
}

// ---------------------------------------------------------------------------
// Network-element computation

export function computeNetworkElement(
  lib: Library,
  ne: NetworkElement,
  assumptions: ProjectAssumptions,
  overlay?: Overlay,
): NetworkElementComputation {
  const blockIndex = new Map<number, BuildingBlock>();
  for (const b of lib.building_blocks) blockIndex.set(b.id, b);

  // baseline_C = Σ qty × unit_cost[C]   (overlay may transform per-block cost)
  let baseline = zeroDirect();
  for (const sel of ne.building_blocks) {
    const block = blockIndex.get(sel.library_block_id);
    if (!block) continue;                 // silently ignore missing refs
    if (!Number.isFinite(sel.quantity) || sel.quantity < 0) continue;
    const blockCost = applyOverlayToBlock(block, overlay);
    baseline = addDirect(baseline, scaleDirect(blockCost, sel.quantity));
  }

  const adjs = effectiveAttributes(lib, ne, assumptions);
  const knowns = effectiveKnownRisks(lib, ne, assumptions);
  const unknowns = effectiveUnknownRisks(lib, ne, assumptions);

  const sumFactors = (rows: { factor: DirectCosts }[]): DirectCosts => {
    let acc = zeroDirect();
    for (const r of rows) acc = addDirect(acc, r.factor);
    return acc;
  };

  const adjustment_factor = sumFactors(adjs);
  const known_risk_factor = sumFactors(knowns);
  const unknown_risk_factor = sumFactors(unknowns);

  const adjusted_baseline = multiplyDirect(baseline, onesPlus(adjustment_factor));
  const known_risk_allowance = multiplyDirect(baseline, known_risk_factor);
  const unknown_risk_allowance = multiplyDirect(baseline, unknown_risk_factor);

  const total_by_category = {} as DirectCosts;
  for (const k of DIRECT_COST_KEYS) {
    total_by_category[k] =
      adjusted_baseline[k] + known_risk_allowance[k] + unknown_risk_allowance[k];
  }
  const total = sumDirect(total_by_category);

  return {
    ne_id: ne.id,
    baseline,
    adjustment_factor,
    known_risk_factor,
    unknown_risk_factor,
    adjusted_baseline,
    known_risk_allowance,
    unknown_risk_allowance,
    total_by_category,
    total,
    resolved: {
      attributes: resolveAttributeSelections(ne, assumptions),
      known_risks: resolveKnownRiskSelections(ne, assumptions),
      unknown_risks: resolveUnknownRiskSelections(ne, assumptions),
    },
  };
}

// ---------------------------------------------------------------------------
// Project-level: indirect selection + totals

function bandForDirect(direct: number): ProjectSizeBand {
  if (direct < 50_000_000) return "Below $50 million";
  if (direct < 100_000_000) return "$50-$100 million";
  if (direct < 500_000_000) return "$100-$500 million";
  if (direct < 1_000_000_000) return "$500-$1000 million";
  if (direct < 1_500_000_000) return "$1000-$1500 million";
  return "Above $1500 million";
}

/** Exposed for the UI "suggested band" hint. */
export function suggestedProjectSizeBand(direct: number): ProjectSizeBand {
  return bandForDirect(direct);
}

function findIndirectByScatTtl(
  lib: Library,
  scat: string,
  ttl: string,
): IndirectCost | null {
  return (
    lib.indirect_costs.find(
      (i) => i.scat === scat && i.ttl.trim().toLowerCase() === ttl.trim().toLowerCase(),
    ) ?? null
  );
}

export function resolveIndirectSelections(
  lib: Library,
  assumptions: ProjectAssumptions,
  projectDirect: number,
) {
  const band: ProjectSizeBand =
    assumptions.project_size_band === "auto"
      ? bandForDirect(projectDirect)
      : assumptions.project_size_band;
  const brownfield_row = findIndirectByScatTtl(lib, assumptions.greenfield_status, band);
  const stakeholder_row = findIndirectByScatTtl(
    lib,
    "Stakeholder and community sensitive region",
    assumptions.stakeholder_sensitivity,
  );
  const delivery_row = findIndirectByScatTtl(
    lib,
    "Contract delivery model",
    assumptions.delivery_model,
  );
  return {
    band,
    brownfield_row,
    stakeholder_row,
    delivery_row,
  };
}

const ZERO_RANGE_CLASSES: readonly EstimateClass[] = ["Class 4", "Class 3", "Class 1/2"];

export function rangeMultiplier(c: EstimateClass | "Mixed"): number {
  if (c === "Class 5b") return 0.5;
  if (c === "Class 5a") return 0.3;
  if (c === "Mixed") return 0.5;
  if (ZERO_RANGE_CLASSES.includes(c as EstimateClass)) return 0;
  return 0.5;
}

export function computeProject(
  project: Project,
  library: Library,
  overlay?: Overlay,
): ProjectComputation {
  const networkElementResults: NetworkElementComputation[] = project.network_elements.map(
    (ne) => computeNetworkElement(library, ne, project.project_assumptions, overlay),
  );

  let projectDirectByCategory = zeroDirect();
  for (const r of networkElementResults) {
    projectDirectByCategory = addDirect(projectDirectByCategory, r.total_by_category);
  }
  const project_direct = sumDirect(projectDirectByCategory);

  const sel = resolveIndirectSelections(library, project.project_assumptions, project_direct);
  const indirect_rows = [sel.brownfield_row, sel.stakeholder_row, sel.delivery_row].filter(
    (r): r is IndirectCost => r !== null,
  );

  const indirect_factor = zeroIndirect();
  for (const ic of indirect_rows) {
    for (const k of INDIRECT_COST_KEYS) indirect_factor[k] += ic.factor[k];
  }
  const indirect_by_category = {} as IndirectCosts;
  for (const k of INDIRECT_COST_KEYS) {
    indirect_by_category[k] = project_direct * indirect_factor[k];
  }
  const total_indirect = INDIRECT_COST_KEYS.reduce(
    (s, k: IndirectCostKey) => s + indirect_by_category[k],
    0,
  );

  const project_total_central = project_direct + total_indirect;
  const estimate_class = inferEstimateClass(project);
  const r = rangeMultiplier(estimate_class);

  return {
    library_version: library.metadata.library_version,
    computed_at: new Date().toISOString(),
    network_elements: networkElementResults,
    project_direct,
    project_direct_by_category: projectDirectByCategory,
    indirect_selections: {
      brownfield_band: {
        scat: project.project_assumptions.greenfield_status,
        ttl: sel.band,
        ic_id: sel.brownfield_row?.id ?? null,
      },
      stakeholder: {
        ttl: project.project_assumptions.stakeholder_sensitivity,
        ic_id: sel.stakeholder_row?.id ?? null,
      },
      delivery_model: {
        ttl: project.project_assumptions.delivery_model,
        ic_id: sel.delivery_row?.id ?? null,
      },
    },
    indirect_by_category,
    total_indirect,
    project_total_central,
    project_total_low: project_total_central * (1 - r),
    project_total_high: project_total_central * (1 + r),
    range_multiplier: r,
    estimate_class,
  };
}

// Re-export useful types for callers
export { PROJECT_SIZE_BANDS };
