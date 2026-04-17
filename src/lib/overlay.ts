import type { BuildingBlock, DirectCostKey, DirectCosts, Library } from "@/types/library";
import { DIRECT_COST_KEYS } from "@/types/library";
import type { Overlay } from "@/types/overlay";

export { emptyOverlay } from "@/types/overlay";

/**
 * Apply overlay corrections to a library building block's per-unit costs.
 * Returns a new DirectCosts; never mutates the library.
 *
 * In Phase 1 every caller passes an empty overlay, so the function returns
 * the block's own costs unchanged. A unit test locks in this no-op path.
 */
export function applyOverlayToBlock(
  block: BuildingBlock,
  overlay: Overlay | undefined,
): DirectCosts {
  if (!overlay || overlay.corrections.length === 0) return { ...block.cost };
  const out: DirectCosts = { ...block.cost };
  for (const c of overlay.corrections) {
    if (c.library_block_id !== block.id) continue;
    for (const col of c.cost_columns) {
      if (c.correction_type === "multiplier") {
        out[col] = out[col] * c.factor;
      } else {
        out[col] = out[col] + c.factor;
      }
    }
  }
  return out;
}

/** Project-direct-cost-scale correction not used in Phase 1; returns a copy. */
export function applyOverlayToLibrary(lib: Library, overlay: Overlay | undefined): Library {
  if (!overlay || overlay.corrections.length === 0) return lib;
  const blocks = lib.building_blocks.map((b) => ({
    ...b,
    cost: applyOverlayToBlock(b, overlay),
    tbbc: DIRECT_COST_KEYS.reduce(
      (s, k: DirectCostKey) => s + applyOverlayToBlock(b, overlay)[k],
      0,
    ),
  }));
  return { ...lib, building_blocks: blocks };
}
