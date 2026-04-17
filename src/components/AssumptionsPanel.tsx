import type { Library } from "@/types/library";
import type { Project, ProjectSizeBand } from "@/types/project";
import { PROJECT_SIZE_BANDS, ESTIMATE_CLASSES } from "@/types/project";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { suggestedProjectSizeBand } from "@/lib/calc";
import { formatAUD } from "@/lib/utils";

const AUS_STATES = ["NSW", "VIC", "QLD", "SA", "TAS"] as const;

function subregionsForState(library: Library, state: string): string[] {
  const adjs = library.adjustments.filter(
    (a) => a.scat === "Jurisdiction" && a.ttl.startsWith(state + " - "),
  );
  return Array.from(new Set(adjs.map((a) => a.ttl)));
}

function risksForKnownScat(library: Library, scat: string): string[] {
  const cats = ["Station known risk", "Overhead line known risk", "Underground cable known risk"];
  const ttls = new Set<string>();
  for (const r of library.risks) {
    if (cats.includes(r.cat) && r.scat === scat) ttls.add(r.ttl);
  }
  return Array.from(ttls);
}

export function AssumptionsPanel({
  project,
  library,
  projectDirect,
  onChange,
}: {
  project: Project;
  library: Library;
  projectDirect: number;
  onChange: (patch: (p: Project) => void) => void;
}) {
  const a = project.project_assumptions;
  const subs = a.jurisdiction.state ? subregionsForState(library, a.jurisdiction.state) : [];
  const suggestedBand: ProjectSizeBand = suggestedProjectSizeBand(projectDirect);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Project assumptions</CardTitle>
          <CardDescription>
            These values cascade to every network element unless a network-element-specific
            override is set. Change any value and all totals update live.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <div className="mb-1 font-medium">Jurisdiction — state</div>
            <Select
              value={a.jurisdiction.state ?? ""}
              onChange={(e) =>
                onChange((p) => {
                  p.project_assumptions.jurisdiction.state = e.target.value || null;
                  p.project_assumptions.jurisdiction.subregion = null;
                })
              }
            >
              <option value="">— none —</option>
              {AUS_STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </Select>
          </label>
          <label className="text-sm">
            <div className="mb-1 font-medium">Jurisdiction — subregion</div>
            <Select
              value={a.jurisdiction.subregion ?? ""}
              disabled={!a.jurisdiction.state}
              onChange={(e) =>
                onChange((p) => {
                  p.project_assumptions.jurisdiction.subregion = e.target.value || null;
                })
              }
            >
              <option value="">Use state average</option>
              {subs.map((s) => (<option key={s} value={s}>{s}</option>))}
            </Select>
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Greenfield or brownfield</div>
            <Select
              value={a.greenfield_status}
              onChange={(e) => onChange((p) => { p.project_assumptions.greenfield_status = e.target.value as typeof a.greenfield_status; })}
            >
              <option value="Greenfield">Greenfield</option>
              <option value="Partly brownfield">Partly brownfield</option>
              <option value="Brownfield">Brownfield</option>
            </Select>
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Contract delivery model</div>
            <Select
              value={a.delivery_model}
              onChange={(e) => onChange((p) => { p.project_assumptions.delivery_model = e.target.value as typeof a.delivery_model; })}
            >
              <option value="EPC contract">EPC contract</option>
              <option value="D&C contract">D&C contract</option>
            </Select>
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Stakeholder sensitivity</div>
            <Select
              value={a.stakeholder_sensitivity}
              onChange={(e) => onChange((p) => { p.project_assumptions.stakeholder_sensitivity = e.target.value as typeof a.stakeholder_sensitivity; })}
            >
              <option value="Commensurate with land use">Commensurate with land use</option>
              <option value="Sensitive">Sensitive</option>
              <option value="Highly sensitive">Highly sensitive</option>
            </Select>
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">
              Project size band
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                (suggested from {formatAUD(projectDirect)}: {suggestedBand})
              </span>
            </div>
            <Select
              value={a.project_size_band}
              onChange={(e) => onChange((p) => { p.project_assumptions.project_size_band = e.target.value as typeof a.project_size_band; })}
            >
              <option value="auto">Auto (follow direct cost)</option>
              {PROJECT_SIZE_BANDS.map((b) => (<option key={b} value={b}>{b}</option>))}
            </Select>
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Macroeconomic influence (known risk default)</div>
            <Select
              value={a.macroeconomic}
              onChange={(e) => onChange((p) => { p.project_assumptions.macroeconomic = e.target.value; })}
            >
              {risksForKnownScat(library, "Macroeconomic influence").map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </label>

          <label className="text-sm">
            <div className="mb-1 font-medium">Market activity (known risk default)</div>
            <Select
              value={a.market_activity}
              onChange={(e) => onChange((p) => { p.project_assumptions.market_activity = e.target.value; })}
            >
              {risksForKnownScat(library, "Market activity").map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </label>

          <label className="text-sm md:col-span-2">
            <div className="mb-1 font-medium">Estimate class (sets default unknown risks on every NE)</div>
            <Select
              value={a.estimate_class}
              onChange={(e) => onChange((p) => { p.project_assumptions.estimate_class = e.target.value as typeof a.estimate_class; })}
            >
              {ESTIMATE_CLASSES.map((c) => (<option key={c} value={c}>{c}</option>))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Class 5b (±50%) is the intended use of the TCD. Class 4/3/2/1 are for AEMO
              internal cross-checking only — do not use for ISP modelling inputs.
            </p>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
