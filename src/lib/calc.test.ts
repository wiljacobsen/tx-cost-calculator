import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { computeProject } from "./calc";
import { emptyOverlay } from "./overlay";
import { getLibrary, verifyLibraryHash } from "./library";
import { DIRECT_COST_KEYS, INDIRECT_COST_KEYS } from "@/types/library";
import type { Project } from "@/types/project";

const refPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "..",
  "tests",
  "reference-cases",
  "synchronous-condenser.json",
);

const reference = JSON.parse(fs.readFileSync(refPath, "utf-8")) as {
  project: Project;
  expected: {
    baseline_by_category: Record<string, number>;
    total_by_category: Record<string, number>;
    network_element_total: number;
    indirect: Record<string, number>;
    total_indirect: number;
    project_total_central: number;
    project_total_low: number;
    project_total_high: number;
  };
};

describe("library integrity", () => {
  it("embedded content_hash is consistent", async () => {
    const lib = getLibrary();
    expect(await verifyLibraryHash(lib)).toBe(true);
  });

  it("rejects a tampered bundle", async () => {
    const lib = getLibrary();
    const tampered = {
      ...lib,
      building_blocks: [
        { ...lib.building_blocks[0], cost: { ...lib.building_blocks[0].cost, PL: 1 } },
        ...lib.building_blocks.slice(1),
      ],
    };
    expect(await verifyLibraryHash(tampered)).toBe(false);
  });

  it("all building blocks: TBBC = Σ cost columns", () => {
    const lib = getLibrary();
    for (const b of lib.building_blocks) {
      const sum = DIRECT_COST_KEYS.reduce((s, k) => s + b.cost[k], 0);
      expect(Math.abs(sum - b.tbbc)).toBeLessThan(1e-6 * Math.max(1, Math.abs(b.tbbc)));
    }
  });

  it("brownfield-band indirect rows: TIC = Σ indirect columns", () => {
    const lib = getLibrary();
    const bandScats = new Set(["Greenfield", "Partly brownfield", "Brownfield"]);
    for (const ic of lib.indirect_costs) {
      if (!bandScats.has(ic.scat)) continue;
      const sum = INDIRECT_COST_KEYS.reduce((s, k) => s + ic.factor[k], 0);
      expect(Math.abs(sum - ic.tic)).toBeLessThan(1e-9);
    }
  });
});

describe("reference case — Marsden 330kV SS (workbook usr* sheets)", () => {
  const lib = getLibrary();
  const computed = computeProject(reference.project, lib);

  it("has exactly one network element", () => {
    expect(computed.network_elements).toHaveLength(1);
  });

  it("baseline per category matches to the cent", () => {
    for (const k of DIRECT_COST_KEYS) {
      expect(computed.network_elements[0].baseline[k]).toBeCloseTo(
        reference.expected.baseline_by_category[k],
        2,
      );
    }
  });

  it("total per category matches to the cent", () => {
    for (const k of DIRECT_COST_KEYS) {
      expect(computed.network_elements[0].total_by_category[k]).toBeCloseTo(
        reference.expected.total_by_category[k],
        2,
      );
    }
  });

  it("network element total matches to the cent", () => {
    expect(computed.network_elements[0].total).toBeCloseTo(
      reference.expected.network_element_total,
      2,
    );
  });

  it("each indirect line matches to the cent", () => {
    for (const k of INDIRECT_COST_KEYS) {
      expect(computed.indirect_by_category[k]).toBeCloseTo(
        reference.expected.indirect[k],
        2,
      );
    }
  });

  it("total indirect matches to the cent", () => {
    expect(computed.total_indirect).toBeCloseTo(reference.expected.total_indirect, 2);
  });

  it("project total central matches to the cent", () => {
    expect(computed.project_total_central).toBeCloseTo(
      reference.expected.project_total_central,
      2,
    );
  });

  it("applies Class 5b ±50% range", () => {
    expect(computed.range_multiplier).toBe(0.5);
    expect(computed.project_total_low).toBeCloseTo(
      reference.expected.project_total_low,
      2,
    );
    expect(computed.project_total_high).toBeCloseTo(
      reference.expected.project_total_high,
      2,
    );
  });

  it("resolves BAU + Class 5b defaults when no overrides are set", () => {
    const resolved = computed.network_elements[0].resolved;
    expect(resolved.known_risks["Macroeconomic influence"]).toBe("BAU");
    expect(resolved.known_risks["Environmental offset risks"]).toBe("BAU");
    expect(resolved.unknown_risks["Scope and technology risks"]).toBe("Class 5b");
  });

  it("picks the '$100-$500 million' Brownfield indirect row", () => {
    expect(computed.indirect_selections.brownfield_band.scat).toBe("Brownfield");
    expect(computed.indirect_selections.brownfield_band.ttl).toBe("$100-$500 million");
    expect(computed.indirect_selections.brownfield_band.ic_id).not.toBeNull();
  });
});

describe("overlay", () => {
  it("no-op: empty overlay produces identical results to no overlay", () => {
    const lib = getLibrary();
    const a = computeProject(reference.project, lib);
    const b = computeProject(
      reference.project,
      lib,
      emptyOverlay(lib.metadata.library_version),
    );
    const strip = (x: typeof a) => ({ ...x, computed_at: "" });
    expect(strip(a)).toEqual(strip(b));
  });
});

describe("assumption inheritance", () => {
  const lib = getLibrary();

  it("changing project macroeconomic assumption flows to unoverridden NEs", () => {
    const base = JSON.parse(JSON.stringify(reference.project)) as Project;
    const hi = JSON.parse(JSON.stringify(reference.project)) as Project;
    hi.project_assumptions.macroeconomic = "Increased uncertanity";
    const a = computeProject(base, lib);
    const b = computeProject(hi, lib);
    expect(b.project_total_central).toBeGreaterThan(a.project_total_central);
  });

  it("NE override beats project default", () => {
    const withOverride = JSON.parse(JSON.stringify(reference.project)) as Project;
    withOverride.project_assumptions.macroeconomic = "Increased uncertanity";
    withOverride.network_elements[0].known_risk_overrides["Macroeconomic influence"] = "BAU";
    const a = computeProject(reference.project, lib);
    const b = computeProject(withOverride, lib);
    expect(b.network_elements[0].total).toBeCloseTo(a.network_elements[0].total, 2);
  });

  it("doubling building-block quantity doubles the baseline", () => {
    const p = JSON.parse(JSON.stringify(reference.project)) as Project;
    for (const bb of p.network_elements[0].building_blocks) bb.quantity *= 2;
    const baseBaseline = computeProject(reference.project, lib).network_elements[0].baseline;
    const doubled = computeProject(p, lib).network_elements[0].baseline;
    for (const k of DIRECT_COST_KEYS) {
      expect(doubled[k]).toBeCloseTo(baseBaseline[k] * 2, 2);
    }
  });

  it("empty NE contributes zero", () => {
    const p = JSON.parse(JSON.stringify(reference.project)) as Project;
    p.network_elements[0].building_blocks = [];
    const c = computeProject(p, lib);
    expect(c.project_direct).toBe(0);
    expect(c.total_indirect).toBe(0);
    expect(c.project_total_central).toBe(0);
  });
});

describe("estimate-class range multipliers", () => {
  const lib = getLibrary();
  it("Class 5b → ±50%", () => {
    const p = JSON.parse(JSON.stringify(reference.project)) as Project;
    p.project_assumptions.estimate_class = "Class 5b";
    expect(computeProject(p, lib).range_multiplier).toBe(0.5);
  });
  it("Class 5a → ±30%", () => {
    const p = JSON.parse(JSON.stringify(reference.project)) as Project;
    p.project_assumptions.estimate_class = "Class 5a";
    expect(computeProject(p, lib).range_multiplier).toBe(0.3);
  });
});
