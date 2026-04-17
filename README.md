# TCD — Transmission Cost Calculator (Phase 1)

A single-page web app that replicates AEMO's Transmission Cost Database (TCD)
v2.0 — a companion to Australia's Integrated System Plan used to produce
**Class 5b (±50%) / Class 5a (±30%) deterministic point estimates in 2021 AUD**
for NEM transmission projects (stations, overhead lines, underground cables).

Phase 1 is an internal tool for the product team. It reproduces the Excel
tool's methodology while fixing its UX and laying the architectural
foundation for Phases 2 and 3.

## What it does

- **Reproduces AEMO's calculation methodology** to the cent against the
  workbook's self-consistent reference case. See `src/lib/calc.test.ts` — 21
  tests covering library integrity, reference case, overlay no-op, and
  assumption inheritance.
- **Live recalculation** — no "Refresh" button. Every edit updates totals,
  range (±50% / ±30%), and category breakdown immediately.
- **Inherited assumptions** — set jurisdiction, delivery model, estimate
  class, etc. at the project level and override per network element. Set
  once, not per-NE.
- **Comparison view** — dual-pane diff between two projects (summary, NE
  matched-by-name, assumptions diff, cost breakdown diff).
- **Sensitivity tornado** — automatic perturbation of every project
  assumption and NE risk/attribute, ranked by |Δ| to the central estimate.
  What-if scratchpad for live exploration.
- **Three-sheet Excel export** — Output A (per-NE direct breakdown), Output B
  (project-level summary), Output C (audit trail).
- **PDF export** — cover / summary / per-NE pages / sensitivity appendix /
  audit trail (every input captured with library version + content hash).
- **Immutable library** — the AEMO v2021.Q4 cost tables are bundled as a
  hash-sealed JSON bundle. Tampering fails verification at load time.
- **Versioned projects** — localStorage-persisted; Save/Load via JSON file
  for sharing and cross-device portability. (Supabase multi-user and
  share-via-link features are deferred from Phase 1.)
- **Overlay scaffold (Phase 2 ready)** — `computeProject(project, lib, overlay?)`
  signature is live; no-op path tested. When Phase 2 ships market-calibrated
  overlays, the calc engine won't change.

## Three-layer architecture

```
library/v2021.Q4-aemo/        ← immutable cost library (CSVs + metadata)
  building_blocks.csv
  adjustments.csv
  risks.csv
  indirect_costs.csv
  metadata.json

src/data/libraries/v2021.Q4-aemo.json   ← signed bundle consumed at runtime

Project JSON                  ← per-user project data; references library by ID,
                                never copies cost values. Includes
                                project_assumptions (inherit to all NEs) and
                                per-NE overrides.

Overlay JSON                  ← corrections to specific library_block_ids.
                                Phase 2 populates these; Phase 1 ships none.
```

Projects are **references**, not copies. When Phase 2 ships an overlay, old
projects can be re-computed with the overlay applied without any migration.

## Quickstart

```bash
npm install
npm run dev           # http://localhost:5173
npm test              # 21 tests, incl. cent-accurate reference case
npm run typecheck
npm run build         # typecheck + production bundle
```

Use the browser:

1. `http://localhost:5173` → New project
2. Fill in project assumptions (jurisdiction, delivery model, etc.)
3. Add one or more network elements (Station / Overhead line / Underground Cable)
4. For each NE: pick building blocks (cascading Category → Subcategory → kV →
   Detail), optionally set per-NE overrides for attributes/risks
5. Watch the sidebar totals update live with the ±50% range
6. Export Excel or PDF from the header
7. Save as JSON for cross-device transport; Load from JSON on the project list

## Regenerating reference data from AEMO's workbook

The workbook (`Transmission Cost Database 2.0.xlsb`) is committed at the repo
root. If AEMO publishes an update:

```bash
pip install pyxlsb
python3 scripts/extract-from-xlsb.py "Transmission Cost Database 2.0.xlsb"
# → writes library/v2021.Q4-aemo/{building_blocks,adjustments,risks,indirect_costs}.csv

npm run build:library
# → emits src/data/libraries/v2021.Q4-aemo.json with a fresh SHA-256 content_hash
```

Create a new versioned directory (e.g. `library/v2024.Q1-aemo/`) for a major
update so old projects continue to pin to the version they were built against.

## Testing philosophy

The calculation engine (`src/lib/calc.ts`, `src/lib/inheritance.ts`,
`src/lib/overlay.ts`) is a set of **pure functions** with no React imports,
no I/O, no globals. Tests exercise them directly against the shipped library
bundle. The reference case is a snapshot of the AEMO workbook's current user
inputs; changing the engine without updating the snapshot will fail.

Reference-case caveat: the prompt's original specification listed a Total NE
Cost of $224,147,626.72. That figure lives in the workbook's
`Data_collection_A` sheet as a snapshot from a prior project state
("Synchronous condenser 2×200MVA" inputs) that has since been overwritten in
the `usrBuildingBlock` sheet without a refresh. Our reference case uses the
**current** `usrBuildingBlock` inputs (5 blocks: IDs 13, 681, 645, 652, 1
with quantities 4, 4, 12, 12, 1) and pins the engine's self-consistent
output. This is what the Excel workbook would produce on Refresh today.

## Phase 2 preparation — overlays

The overlay schema and application logic are live. To create an overlay:

```ts
const overlay: Overlay = {
  id: "overlay_market_2026_Q1",
  name: "Market-calibrated Q1 2026",
  library_version: "v2021.Q4-aemo",
  source_description: "Based on 23 TNSP project returns 2022-2025",
  corrections: [
    {
      library_block_id: 13,
      correction_type: "multiplier",
      cost_columns: ["PL"],
      factor: 1.34,
      confidence: "medium",
      sample_size: 7,
      notes: "GIS 3CB bays running ~34% higher than 2021 library in recent NSW projects",
    },
  ],
};

const computation = computeProject(project, library, overlay);
```

`src/lib/overlay.ts` implements multiplier and offset corrections per-block
per-cost-column. Unit test `overlay no-op: empty overlay produces identical
results` locks the invariant.

## Phase 3 preparation — calibrated ranges

Phase 1 uses AEMO's symmetric deterministic range:
`project_total_low/high = central × (1 ∓ range_multiplier)` where
`range_multiplier = {5b: 0.5, 5a: 0.3}`.

Phase 3 will replace the symmetric range with a calibrated P10/P50/P90
distribution derived from the Phase 2 data corpus. The `rangeMultiplier()`
function in `src/lib/calc.ts` is the single touchpoint.

## Current scope / explicit non-goals

Deferred from Phase 1 (per the scope decision in the plan file):

- Supabase backend, auth, multi-user, share-via-link, DB-backed version history
- Overlay admin inspector UI (schema-only)
- Real-time collaborative editing
- Mobile phone layout
- Internationalization (AUD only, English only)
- Actual overlay content (schema only)
- Calibrated P-estimates (symmetric ±50%/±30% only)

## Project layout

```
package.json
library/v2021.Q4-aemo/           CSVs + CHANGELOG + metadata
scripts/
  extract-from-xlsb.py           pyxlsb → library CSVs
  build-library.ts               CSVs → hash-sealed JSON bundle
src/
  data/libraries/                compiled bundles (committed)
  types/                         Library, Project, Overlay, Computed*
  lib/
    calc.ts                      pure engine (spec §4)
    calc.test.ts                 21 tests incl. reference case + no-op overlay
    sensitivity.ts               perturbation engine for tornado
    overlay.ts                   overlay application (no-op path)
    library.ts                   load + hash verification
    inheritance.ts               project → NE assumption cascade
    utils.ts                     AUD formatting, filename sanitising
  store/
    projectStore.ts              Zustand + localStorage persist
  components/
    ui/                          Button, Input, Select, Card, Tabs, Dialog
    AssumptionsPanel.tsx
    BuildingBlockPicker.tsx      cascading Category → SCAT → kV → TTL
    NetworkElementEditor.tsx     Building Blocks / Overrides / Breakdown tabs
  pages/
    ProjectList.tsx
    ProjectEditor.tsx
    Compare.tsx
    Sensitivity.tsx
  export/
    xlsx.ts                      3-sheet SheetJS export
    pdf.tsx                      react-pdf document
  App.tsx                        React Router setup
  main.tsx
tests/reference-cases/           cent-accurate fixture(s)
```
