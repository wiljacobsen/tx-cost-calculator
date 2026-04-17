/**
 * Pure sensitivity / tornado-chart engine. Given a project, perturbs each
 * project-level assumption and each network-element attribute/risk to its
 * "most impactful alternative" and records the resulting change in
 * project_total_central vs the base case.
 */
import type { Library } from "@/types/library";
import {
  topCategoryFromAdjustmentCat,
  topCategoryFromRiskCat,
  riskKindFromRiskCat,
} from "@/types/library";
import type {
  NetworkElement,
  Project,
} from "@/types/project";
import { PROJECT_SIZE_BANDS, ESTIMATE_CLASSES } from "@/types/project";
import { computeProject } from "./calc";

export interface SensitivityDriver {
  /** Human-readable label. */
  label: string;
  /** Description of the base → alternative change. */
  change: string;
  /** Delta project_total_central when the alternative is picked instead. */
  delta: number;
  /** Target "alternative" total (for positioning on the chart). */
  alternative_total: number;
  /** Scope: "project" or ne id */
  scope: "project" | string;
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

/** Given base project_total, pick the alternative for this SCAT that yields
 *  the largest |delta|. Returns {label, delta, alternative_total}. */
function evaluateAlternatives(
  project: Project,
  library: Library,
  baseTotal: number,
  apply: (p: Project, ttl: string) => void,
  options: string[],
  currentTtl: string,
): { ttl: string; delta: number; total: number } | null {
  let best: { ttl: string; delta: number; total: number } | null = null;
  for (const o of options) {
    if (o === currentTtl) continue;
    const trial = clone(project);
    apply(trial, o);
    const total = computeProject(trial, library).project_total_central;
    const delta = total - baseTotal;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) {
      best = { ttl: o, delta, total };
    }
  }
  return best;
}

export interface SensitivityResult {
  base_total: number;
  drivers: SensitivityDriver[];
}

export function computeSensitivity(project: Project, library: Library): SensitivityResult {
  const base = computeProject(project, library);
  const baseTotal = base.project_total_central;

  const drivers: SensitivityDriver[] = [];

  // ---- project-level assumptions --------------------------------------
  // Estimate class
  {
    const alt = evaluateAlternatives(
      project,
      library,
      baseTotal,
      (p, ttl) => { p.project_assumptions.estimate_class = ttl as typeof p.project_assumptions.estimate_class; },
      ESTIMATE_CLASSES.slice(),
      project.project_assumptions.estimate_class,
    );
    if (alt) {
      drivers.push({
        label: "Estimate class",
        change: `${project.project_assumptions.estimate_class} → ${alt.ttl}`,
        delta: alt.delta,
        alternative_total: alt.total,
        scope: "project",
      });
    }
  }

  // Greenfield status
  {
    const alt = evaluateAlternatives(
      project,
      library,
      baseTotal,
      (p, ttl) => { p.project_assumptions.greenfield_status = ttl as typeof p.project_assumptions.greenfield_status; },
      ["Greenfield", "Partly brownfield", "Brownfield"],
      project.project_assumptions.greenfield_status,
    );
    if (alt) {
      drivers.push({
        label: "Greenfield status",
        change: `${project.project_assumptions.greenfield_status} → ${alt.ttl}`,
        delta: alt.delta,
        alternative_total: alt.total,
        scope: "project",
      });
    }
  }

  // Delivery model
  {
    const alt = evaluateAlternatives(
      project,
      library,
      baseTotal,
      (p, ttl) => { p.project_assumptions.delivery_model = ttl as typeof p.project_assumptions.delivery_model; },
      ["EPC contract", "D&C contract"],
      project.project_assumptions.delivery_model,
    );
    if (alt) {
      drivers.push({
        label: "Delivery model",
        change: `${project.project_assumptions.delivery_model} → ${alt.ttl}`,
        delta: alt.delta,
        alternative_total: alt.total,
        scope: "project",
      });
    }
  }

  // Stakeholder sensitivity
  {
    const alt = evaluateAlternatives(
      project,
      library,
      baseTotal,
      (p, ttl) => { p.project_assumptions.stakeholder_sensitivity = ttl as typeof p.project_assumptions.stakeholder_sensitivity; },
      ["Commensurate with land use", "Sensitive", "Highly sensitive"],
      project.project_assumptions.stakeholder_sensitivity,
    );
    if (alt) {
      drivers.push({
        label: "Stakeholder sensitivity",
        change: `${project.project_assumptions.stakeholder_sensitivity} → ${alt.ttl}`,
        delta: alt.delta,
        alternative_total: alt.total,
        scope: "project",
      });
    }
  }

  // Project size band
  {
    const cur =
      project.project_assumptions.project_size_band === "auto"
        ? "auto"
        : project.project_assumptions.project_size_band;
    const alt = evaluateAlternatives(
      project,
      library,
      baseTotal,
      (p, ttl) => { p.project_assumptions.project_size_band = ttl as typeof p.project_assumptions.project_size_band; },
      PROJECT_SIZE_BANDS.slice(),
      cur,
    );
    if (alt) {
      drivers.push({
        label: "Project size band",
        change: `${cur} → ${alt.ttl}`,
        delta: alt.delta,
        alternative_total: alt.total,
        scope: "project",
      });
    }
  }

  // Macroeconomic, Market activity
  for (const field of ["macroeconomic", "market_activity"] as const) {
    const scat = field === "macroeconomic" ? "Macroeconomic influence" : "Market activity";
    const options = Array.from(
      new Set(
        library.risks
          .filter((r) => riskKindFromRiskCat(r.cat) === "known" && r.scat === scat)
          .map((r) => r.ttl),
      ),
    );
    const cur = project.project_assumptions[field];
    const alt = evaluateAlternatives(
      project,
      library,
      baseTotal,
      (p, ttl) => { p.project_assumptions[field] = ttl; },
      options,
      cur,
    );
    if (alt) {
      drivers.push({
        label: scat,
        change: `${cur} → ${alt.ttl}`,
        delta: alt.delta,
        alternative_total: alt.total,
        scope: "project",
      });
    }
  }

  // ---- per-network-element attributes and risks -----------------------
  for (const ne of project.network_elements) {
    // Attributes
    const attrSCATs = Array.from(
      new Set(
        library.adjustments
          .filter((a) => topCategoryFromAdjustmentCat(a.cat) === ne.category)
          .map((a) => a.scat),
      ),
    );
    for (const scat of attrSCATs) {
      const options = Array.from(
        new Set(
          library.adjustments
            .filter((a) => topCategoryFromAdjustmentCat(a.cat) === ne.category && a.scat === scat)
            .map((a) => a.ttl),
        ),
      );
      const cur = ne.attribute_overrides[scat] ?? "";
      const alt = evaluateAlternatives(
        project,
        library,
        baseTotal,
        (p, ttl) => {
          const n = p.network_elements.find((x) => x.id === ne.id);
          if (n) n.attribute_overrides[scat] = ttl;
        },
        options,
        cur,
      );
      if (alt) {
        drivers.push({
          label: `${ne.name} · ${scat}`,
          change: `${cur || "(inherit)"} → ${alt.ttl}`,
          delta: alt.delta,
          alternative_total: alt.total,
          scope: ne.id,
        });
      }
    }

    // Known risks
    const knownSCATs = Array.from(
      new Set(
        library.risks
          .filter((r) => topCategoryFromRiskCat(r.cat) === ne.category && riskKindFromRiskCat(r.cat) === "known")
          .map((r) => r.scat),
      ),
    );
    for (const scat of knownSCATs) {
      const options = Array.from(
        new Set(
          library.risks
            .filter((r) => topCategoryFromRiskCat(r.cat) === ne.category && riskKindFromRiskCat(r.cat) === "known" && r.scat === scat)
            .map((r) => r.ttl),
        ),
      );
      const cur = ne.known_risk_overrides[scat] ?? "BAU";
      const alt = evaluateAlternatives(
        project,
        library,
        baseTotal,
        (p, ttl) => {
          const n = p.network_elements.find((x) => x.id === ne.id);
          if (n) n.known_risk_overrides[scat] = ttl;
        },
        options,
        cur,
      );
      if (alt) {
        drivers.push({
          label: `${ne.name} · ${scat}`,
          change: `${cur} → ${alt.ttl}`,
          delta: alt.delta,
          alternative_total: alt.total,
          scope: ne.id,
        });
      }
    }
  }

  drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { base_total: baseTotal, drivers };
}

/**
 * Apply a custom what-if selection to return a modified total.
 */
export function whatIf(
  project: Project,
  library: Library,
  patch: (p: Project) => void,
): number {
  const p = clone(project);
  patch(p);
  return computeProject(p, library).project_total_central;
}

/** Helpers exposed for the Network Element sensitivity driver rename. */
export function neName(project: Project, scope: string): string | null {
  const ne = project.network_elements.find((n) => n.id === scope);
  return ne?.name ?? null;
}
