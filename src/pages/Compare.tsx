import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useProjectStore } from "@/store/projectStore";
import { getLibrary } from "@/lib/library";
import { computeProject } from "@/lib/calc";
import type { Project, ProjectComputation } from "@/types/project";
import { DIRECT_COST_KEYS, DIRECT_COST_LABELS, INDIRECT_COST_KEYS, INDIRECT_COST_LABELS } from "@/types/library";
import { formatAUD } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";

function Delta({ a, b }: { a: number; b: number }) {
  const delta = b - a;
  const pct = a === 0 ? 0 : (delta / a) * 100;
  const cls = delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-destructive" : "text-green-600";
  const sign = delta > 0 ? "+" : delta < 0 ? "\u2212" : "";
  return (
    <span className={cls + " font-mono text-xs"}>
      {sign}{formatAUD(Math.abs(delta))} {a !== 0 && (
        <span>({sign}{Math.abs(pct).toFixed(1)}%)</span>
      )}
    </span>
  );
}

export function Compare() {
  const { id = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const all = useProjectStore((s) => s.projects);
  const library = getLibrary();

  const otherId = search.get("with") ?? "";
  const a = all[id];
  const b = otherId ? all[otherId] : undefined;

  const ca = useMemo(() => (a ? computeProject(a, library) : null), [a, library]);
  const cb = useMemo(() => (b ? computeProject(b, library) : null), [b, library]);

  const otherOptions = Object.values(all).filter((p) => p.id !== id);

  if (!a) {
    return (
      <div className="p-8">
        <Button onClick={() => navigate("/")}>← Back to projects</Button>
        <p className="mt-2">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex items-center justify-between py-3">
          <div>
            <button className="text-xs text-muted-foreground hover:underline mb-1 block" onClick={() => navigate(`/projects/${id}`)}>
              ← Back to {a.name}
            </button>
            <h1 className="text-lg font-semibold">Compare</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Compare with:</span>
            <Select
              value={otherId}
              onChange={(e) => setSearch((s) => {
                const next = new URLSearchParams(s);
                if (e.target.value) next.set("with", e.target.value);
                else next.delete("with");
                return next;
              })}
              className="w-64"
            >
              <option value="">— select —</option>
              {otherOptions.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </Select>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {!b ? (
          <Card>
            <CardHeader>
              <CardTitle>Pick a project to compare against</CardTitle>
              <CardDescription>
                Create a duplicate, change assumptions, and revisit this page to see the side-by-side diff.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {otherOptions.length === 0
                  ? "You only have one project. Duplicate it from the main list to compare two variants."
                  : "Select another project from the dropdown above."}
              </p>
            </CardContent>
          </Card>
        ) : ca && cb ? (
          <CompareBody a={a} b={b} ca={ca} cb={cb} />
        ) : null}
      </main>
    </div>
  );
}

function CompareBody({
  a, b, ca, cb,
}: {
  a: Project; b: Project;
  ca: ProjectComputation; cb: ProjectComputation;
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{a.name}</CardTitle>
            <CardDescription>
              {ca.estimate_class} · ±{(ca.range_multiplier * 100).toFixed(0)}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold font-mono">{formatAUD(ca.project_total_central)}</div>
            <div className="text-xs text-muted-foreground">
              range {formatAUD(ca.project_total_low)} — {formatAUD(ca.project_total_high)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{b.name}</CardTitle>
            <CardDescription>
              {cb.estimate_class} · ±{(cb.range_multiplier * 100).toFixed(0)}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold font-mono">{formatAUD(cb.project_total_central)}</div>
            <div className="text-xs text-muted-foreground">
              range {formatAUD(cb.project_total_low)} — {formatAUD(cb.project_total_high)}
            </div>
            <div className="mt-2">
              <Delta a={ca.project_total_central} b={cb.project_total_central} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="ne">Network elements</TabsTrigger>
          <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
          <TabsTrigger value="breakdown">Cost breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardContent className="pt-4">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Line</th>
                    <th className="p-2 text-right">{a.name}</th>
                    <th className="p-2 text-right">{b.name}</th>
                    <th className="p-2 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <Line label="Direct cost" va={ca.project_direct} vb={cb.project_direct} />
                  <Line label="Indirect cost" va={ca.total_indirect} vb={cb.total_indirect} />
                  <Line label="Total central" va={ca.project_total_central} vb={cb.project_total_central} bold />
                  <Line label="Low bound" va={ca.project_total_low} vb={cb.project_total_low} />
                  <Line label="High bound" va={ca.project_total_high} vb={cb.project_total_high} />
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ne">
          <Card>
            <CardContent className="pt-4">
              <NEDiff a={a} b={b} ca={ca} cb={cb} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assumptions">
          <Card>
            <CardContent className="pt-4">
              <AssumptionsDiff a={a} b={b} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          <Card>
            <CardContent className="pt-4">
              <BreakdownDiff ca={ca} cb={cb} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Line({ label, va, vb, bold }: { label: string; va: number; vb: number; bold?: boolean }) {
  return (
    <tr className={"border-t " + (bold ? "font-semibold" : "")}>
      <td className="p-2">{label}</td>
      <td className="p-2 text-right font-mono">{formatAUD(va)}</td>
      <td className="p-2 text-right font-mono">{formatAUD(vb)}</td>
      <td className="p-2 text-right"><Delta a={va} b={vb} /></td>
    </tr>
  );
}

function NEDiff({ a, b, ca, cb }: { a: Project; b: Project; ca: ProjectComputation; cb: ProjectComputation }) {
  const aByName = new Map(a.network_elements.map((n) => [n.name, n]));
  const bByName = new Map(b.network_elements.map((n) => [n.name, n]));
  const allNames = Array.from(new Set([...aByName.keys(), ...bByName.keys()]));
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="p-2">Network element (matched by name)</th>
          <th className="p-2 text-right">{a.name}</th>
          <th className="p-2 text-right">{b.name}</th>
          <th className="p-2 text-right">Δ</th>
        </tr>
      </thead>
      <tbody>
        {allNames.map((name) => {
          const neA = aByName.get(name);
          const neB = bByName.get(name);
          const totalA = neA ? (ca.network_elements.find((c) => c.ne_id === neA.id)?.total ?? 0) : 0;
          const totalB = neB ? (cb.network_elements.find((c) => c.ne_id === neB.id)?.total ?? 0) : 0;
          return (
            <tr key={name} className="border-t">
              <td className="p-2">
                {name}
                {!neA && <span className="ml-2 text-xs text-muted-foreground">(only in B)</span>}
                {!neB && <span className="ml-2 text-xs text-muted-foreground">(only in A)</span>}
              </td>
              <td className="p-2 text-right font-mono">{neA ? formatAUD(totalA) : "—"}</td>
              <td className="p-2 text-right font-mono">{neB ? formatAUD(totalB) : "—"}</td>
              <td className="p-2 text-right">
                {neA && neB ? <Delta a={totalA} b={totalB} /> : ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AssumptionsDiff({ a, b }: { a: Project; b: Project }) {
  const rows: [string, string, string][] = [
    ["Jurisdiction — state", a.project_assumptions.jurisdiction.state ?? "—", b.project_assumptions.jurisdiction.state ?? "—"],
    ["Jurisdiction — subregion", a.project_assumptions.jurisdiction.subregion ?? "—", b.project_assumptions.jurisdiction.subregion ?? "—"],
    ["Greenfield status", a.project_assumptions.greenfield_status, b.project_assumptions.greenfield_status],
    ["Delivery model", a.project_assumptions.delivery_model, b.project_assumptions.delivery_model],
    ["Stakeholder sensitivity", a.project_assumptions.stakeholder_sensitivity, b.project_assumptions.stakeholder_sensitivity],
    ["Project size band", String(a.project_assumptions.project_size_band), String(b.project_assumptions.project_size_band)],
    ["Macroeconomic", a.project_assumptions.macroeconomic, b.project_assumptions.macroeconomic],
    ["Market activity", a.project_assumptions.market_activity, b.project_assumptions.market_activity],
    ["Estimate class", a.project_assumptions.estimate_class, b.project_assumptions.estimate_class],
  ];
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="p-2">Assumption</th>
          <th className="p-2">{a.name}</th>
          <th className="p-2">{b.name}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, va, vb]) => (
          <tr key={label} className={"border-t " + (va !== vb ? "bg-accent/20" : "")}>
            <td className="p-2">{label}</td>
            <td className="p-2 font-mono text-xs">{va}</td>
            <td className="p-2 font-mono text-xs">{vb}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BreakdownDiff({ ca, cb }: { ca: ProjectComputation; cb: ProjectComputation }) {
  return (
    <>
      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-2">Direct cost by category</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Category</th>
              <th className="p-2 text-right">A</th>
              <th className="p-2 text-right">B</th>
              <th className="p-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {DIRECT_COST_KEYS.map((k) => (
              <tr key={k} className="border-t">
                <td className="p-2">{DIRECT_COST_LABELS[k]}</td>
                <td className="p-2 text-right font-mono">{formatAUD(ca.project_direct_by_category[k])}</td>
                <td className="p-2 text-right font-mono">{formatAUD(cb.project_direct_by_category[k])}</td>
                <td className="p-2 text-right"><Delta a={ca.project_direct_by_category[k]} b={cb.project_direct_by_category[k]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Indirect cost by category</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Category</th>
              <th className="p-2 text-right">A</th>
              <th className="p-2 text-right">B</th>
              <th className="p-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {INDIRECT_COST_KEYS.map((k) => (
              <tr key={k} className="border-t">
                <td className="p-2">{INDIRECT_COST_LABELS[k]}</td>
                <td className="p-2 text-right font-mono">{formatAUD(ca.indirect_by_category[k])}</td>
                <td className="p-2 text-right font-mono">{formatAUD(cb.indirect_by_category[k])}</td>
                <td className="p-2 text-right"><Delta a={ca.indirect_by_category[k]} b={cb.indirect_by_category[k]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
