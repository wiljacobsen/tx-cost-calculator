import * as XLSX from "xlsx";
import type { Project, ProjectComputation } from "@/types/project";
import type { Library } from "@/types/library";
import {
  DIRECT_COST_KEYS,
  DIRECT_COST_LABELS,
  INDIRECT_COST_KEYS,
  INDIRECT_COST_LABELS,
} from "@/types/library";
import {
  effectiveAttributes,
  effectiveKnownRisks,
  effectiveUnknownRisks,
} from "@/lib/inheritance";
import { sanitiseFilename } from "@/lib/utils";

type AOA = (string | number | null)[][];

function auto_fit(ws: XLSX.WorkSheet, aoa: AOA): void {
  const widths: number[] = [];
  for (const row of aoa) {
    row.forEach((cell, i) => {
      const s = cell === null || cell === undefined ? "" : String(cell);
      widths[i] = Math.max(widths[i] ?? 8, Math.min(60, s.length + 2));
    });
  }
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

function applyFormatting(
  ws: XLSX.WorkSheet,
  currencyCells: [number, number][],
  percentCells: [number, number][],
): void {
  for (const [r, c] of currencyCells) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    if (cell && typeof cell.v === "number") {
      cell.z = "$#,##0";
      cell.t = "n";
    }
  }
  for (const [r, c] of percentCells) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    if (cell && typeof cell.v === "number") {
      cell.z = "0.00%";
      cell.t = "n";
    }
  }
}

export function buildProjectWorkbook(
  project: Project,
  computation: ProjectComputation,
  library: Library,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // --- Output A: per-network-element breakdown ------------------------------
  const headerA = [
    "NE #",
    "Network element",
    "Total",
    ...DIRECT_COST_KEYS.map((k) => DIRECT_COST_LABELS[k]),
  ];
  const aoaA: AOA = [
    ["Output A — Per network-element direct-cost breakdown"],
    [`Library ${library.metadata.library_version} · generated ${computation.computed_at}`],
    [],
    headerA,
  ];
  computation.network_elements.forEach((c, i) => {
    const ne = project.network_elements.find((n) => n.id === c.ne_id);
    aoaA.push([
      i + 1,
      ne?.name ?? "(unknown)",
      c.total,
      ...DIRECT_COST_KEYS.map((k) => c.total_by_category[k]),
    ]);
  });
  // blank + indirect block
  aoaA.push([]);
  aoaA.push(["Indirect costs", "", ""]);
  INDIRECT_COST_KEYS.forEach((k) => {
    aoaA.push([INDIRECT_COST_LABELS[k], "", computation.indirect_by_category[k]]);
  });
  aoaA.push(["Total indirect", "", computation.total_indirect]);
  aoaA.push([]);
  aoaA.push([
    "Total expected project cost (central)",
    "",
    computation.project_total_central,
  ]);
  aoaA.push([
    `Range (±${(computation.range_multiplier * 100).toFixed(0)}%)`,
    computation.project_total_low,
    computation.project_total_high,
  ]);

  const wsA = XLSX.utils.aoa_to_sheet(aoaA);
  auto_fit(wsA, aoaA);
  // currency cells: col C onwards for NE rows, col C for indirect lines, col B+C for range
  const currencyA: [number, number][] = [];
  for (let r = 4; r < 4 + computation.network_elements.length; r++) {
    for (let c = 2; c < headerA.length; c++) currencyA.push([r, c]);
  }
  const indirectStart = 4 + computation.network_elements.length + 2;
  for (let i = 0; i < INDIRECT_COST_KEYS.length; i++) currencyA.push([indirectStart + i, 2]);
  const indirectTotalRow = indirectStart + INDIRECT_COST_KEYS.length;
  currencyA.push([indirectTotalRow, 2]);
  currencyA.push([indirectTotalRow + 2, 2]);
  currencyA.push([indirectTotalRow + 3, 1], [indirectTotalRow + 3, 2]);
  applyFormatting(wsA, currencyA, []);
  XLSX.utils.book_append_sheet(wb, wsA, "Output A");

  // --- Output B: project-level summary -------------------------------------
  const headerB = ["", "Total", ...DIRECT_COST_KEYS.map((k) => DIRECT_COST_LABELS[k])];

  function sumDirect(cat: "baseline" | "adjusted_baseline" | "known_risk_allowance" | "unknown_risk_allowance" | "total_by_category") {
    const acc: Record<string, number> = {};
    for (const k of DIRECT_COST_KEYS) acc[k] = 0;
    for (const c of computation.network_elements) {
      for (const k of DIRECT_COST_KEYS) acc[k] += c[cat][k];
    }
    const total = DIRECT_COST_KEYS.reduce((s, k) => s + acc[k], 0);
    return [total, ...DIRECT_COST_KEYS.map((k) => acc[k])];
  }

  const aoaB: AOA = [
    ["Output B — Project-level summary"],
    [`Library ${library.metadata.library_version} · generated ${computation.computed_at}`],
    [],
    headerB,
    ["Baseline", ...sumDirect("baseline")],
    ["Adjusted baseline", ...sumDirect("adjusted_baseline")],
    ["Known risk allowance", ...sumDirect("known_risk_allowance")],
    ["Unknown risk allowance", ...sumDirect("unknown_risk_allowance")],
    ["Total network element cost", ...sumDirect("total_by_category")],
    [],
    ["Indirect costs"],
  ];
  INDIRECT_COST_KEYS.forEach((k) => {
    aoaB.push([INDIRECT_COST_LABELS[k], computation.indirect_by_category[k]]);
  });
  aoaB.push(["Total indirect", computation.total_indirect]);
  aoaB.push([]);
  aoaB.push(["Total expected project cost (central)", computation.project_total_central]);
  aoaB.push(["Project total — low bound", computation.project_total_low]);
  aoaB.push(["Project total — high bound", computation.project_total_high]);
  aoaB.push([
    "Estimate class",
    computation.estimate_class,
    `±${(computation.range_multiplier * 100).toFixed(0)}%`,
  ]);

  const wsB = XLSX.utils.aoa_to_sheet(aoaB);
  auto_fit(wsB, aoaB);
  // Format currency on columns 1..10 for direct-cost rows, and col 1 for indirect rows
  const currencyB: [number, number][] = [];
  for (let r = 4; r <= 8; r++) {
    for (let c = 1; c < headerB.length; c++) currencyB.push([r, c]);
  }
  const indirectStartB = 11;
  for (let i = 0; i <= INDIRECT_COST_KEYS.length; i++) currencyB.push([indirectStartB + i, 1]);
  const projTotalRow = indirectStartB + INDIRECT_COST_KEYS.length + 2;
  currencyB.push([projTotalRow, 1], [projTotalRow + 1, 1], [projTotalRow + 2, 1]);
  applyFormatting(wsB, currencyB, []);
  XLSX.utils.book_append_sheet(wb, wsB, "Output B");

  // --- Output C: audit trail -----------------------------------------------
  const aoaC: AOA = [
    ["Output C — Detailed audit trail"],
    [`Library ${library.metadata.library_version} · generated ${computation.computed_at}`],
    [],
    ["Project", project.name],
    ["Description", project.description],
    [
      "Assumptions",
      JSON.stringify(project.project_assumptions, null, 0),
    ],
    [],
  ];

  const blockIndex = new Map(library.building_blocks.map((b) => [b.id, b]));
  for (const ne of project.network_elements) {
    aoaC.push([`Network element: ${ne.name}`]);
    aoaC.push(["Category", ne.category]);
    aoaC.push(["Description", ne.description]);
    aoaC.push([]);

    aoaC.push(["Building blocks"]);
    aoaC.push([
      "Library ID", "Subcategory", "kV", "Detail", "Unit", "Quantity", "Unit cost", "Line total",
    ]);
    for (const bb of ne.building_blocks) {
      const b = blockIndex.get(bb.library_block_id);
      if (!b) continue;
      aoaC.push([
        b.id, b.scat, b.kv.trim(), b.ttl, b.un, bb.quantity, b.tbbc, b.tbbc * bb.quantity,
      ]);
    }
    aoaC.push([]);

    aoaC.push(["Selected attributes"]);
    aoaC.push(["SCAT", "TTL", "PL", "CS", "EW", "SS", "DS", "TC", "PM", "EP", "EO"]);
    for (const a of effectiveAttributes(library, ne, project.project_assumptions)) {
      aoaC.push([
        a.scat, a.ttl,
        a.factor.PL, a.factor.CS, a.factor.EW, a.factor.SS, a.factor.DS, a.factor.TC, a.factor.PM, a.factor.EP, a.factor.EO,
      ]);
    }
    aoaC.push([]);

    aoaC.push(["Selected known risks"]);
    aoaC.push(["SCAT", "TTL", "PL", "CS", "EW", "SS", "DS", "TC", "PM", "EP", "EO"]);
    for (const r of effectiveKnownRisks(library, ne, project.project_assumptions)) {
      aoaC.push([
        r.scat, r.ttl,
        r.factor.PL, r.factor.CS, r.factor.EW, r.factor.SS, r.factor.DS, r.factor.TC, r.factor.PM, r.factor.EP, r.factor.EO,
      ]);
    }
    aoaC.push([]);

    aoaC.push(["Selected unknown risks"]);
    aoaC.push(["SCAT", "TTL", "PL", "CS", "EW", "SS", "DS", "TC", "PM", "EP", "EO"]);
    for (const r of effectiveUnknownRisks(library, ne, project.project_assumptions)) {
      aoaC.push([
        r.scat, r.ttl,
        r.factor.PL, r.factor.CS, r.factor.EW, r.factor.SS, r.factor.DS, r.factor.TC, r.factor.PM, r.factor.EP, r.factor.EO,
      ]);
    }
    aoaC.push([]);
  }

  const wsC = XLSX.utils.aoa_to_sheet(aoaC);
  auto_fit(wsC, aoaC);
  XLSX.utils.book_append_sheet(wb, wsC, "Output C");

  return wb;
}

export function downloadProjectXlsx(
  project: Project,
  computation: ProjectComputation,
  library: Library,
): void {
  const wb = buildProjectWorkbook(project, computation, library);
  const filename = `TCD_${sanitiseFilename(project.name)}_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
