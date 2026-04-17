import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectStore } from "@/store/projectStore";
import { getLibrary } from "@/lib/library";
import { computeProject } from "@/lib/calc";
import { formatAUD, sanitiseFilename } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { AssumptionsPanel } from "@/components/AssumptionsPanel";
import { NetworkElementEditor } from "@/components/NetworkElementEditor";
import { downloadProjectXlsx } from "@/export/xlsx";
import { downloadProjectPdf } from "@/export/pdf";
import { INDIRECT_COST_KEYS, INDIRECT_COST_LABELS, DIRECT_COST_KEYS, DIRECT_COST_LABELS } from "@/types/library";
import type { TopCategory } from "@/types/library";

export function ProjectEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.projects[id]);
  const updateProject = useProjectStore((s) => s.updateProject);
  const addNetworkElement = useProjectStore((s) => s.addNetworkElement);
  const removeNetworkElement = useProjectStore((s) => s.removeNetworkElement);
  const duplicateNetworkElement = useProjectStore((s) => s.duplicateNetworkElement);
  const updateNetworkElement = useProjectStore((s) => s.updateNetworkElement);
  const addBuildingBlock = useProjectStore((s) => s.addBuildingBlock);
  const updateBuildingBlock = useProjectStore((s) => s.updateBuildingBlock);
  const removeBuildingBlock = useProjectStore((s) => s.removeBuildingBlock);

  const [selectedPanel, setSelectedPanel] = useState<
    { kind: "assumptions" } | { kind: "ne"; id: string } | { kind: "indirect" }
  >({ kind: "assumptions" });

  const library = getLibrary();
  const computed = useMemo(
    () => (project ? computeProject(project, library) : null),
    [project, library],
  );

  if (!project) {
    return (
      <div className="p-8">
        <p>Project not found.</p>
        <Button onClick={() => navigate("/")}>Back to projects</Button>
      </div>
    );
  }

  function handleExportJson() {
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TCD_${sanitiseFilename(project.name)}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleAddNE(cat: TopCategory) {
    const neId = addNetworkElement(project.id, cat);
    if (neId) setSelectedPanel({ kind: "ne", id: neId });
  }

  const selectedNe =
    selectedPanel.kind === "ne"
      ? project.network_elements.find((n) => n.id === selectedPanel.id)
      : null;
  const selectedNeComp =
    selectedNe && computed
      ? computed.network_elements.find((c) => c.ne_id === selectedNe.id)
      : null;

  return (
    <div className="flex min-h-screen bg-background">
      {/* --- Sidebar --- */}
      <aside className="w-72 border-r bg-muted/20 flex flex-col">
        <div className="p-3 border-b">
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => navigate("/")}
          >
            ← All projects
          </button>
        </div>

        <div className="p-3">
          <Input
            className="font-semibold text-base"
            value={project.name}
            onChange={(e) => updateProject(project.id, (p) => { p.name = e.target.value; })}
          />
          <Input
            className="mt-2 text-sm"
            placeholder="Description (optional)"
            value={project.description}
            onChange={(e) => updateProject(project.id, (p) => { p.description = e.target.value; })}
          />
        </div>

        <div className="p-3 border-t">
          <button
            className={
              "w-full text-left rounded px-2 py-1.5 text-sm " +
              (selectedPanel.kind === "assumptions" ? "bg-accent" : "hover:bg-muted")
            }
            onClick={() => setSelectedPanel({ kind: "assumptions" })}
          >
            Project assumptions
          </button>
          <button
            className={
              "mt-1 w-full text-left rounded px-2 py-1.5 text-sm " +
              (selectedPanel.kind === "indirect" ? "bg-accent" : "hover:bg-muted")
            }
            onClick={() => setSelectedPanel({ kind: "indirect" })}
          >
            Indirect costs
          </button>
        </div>

        <div className="p-3 border-t flex-1 overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Network elements</div>
          </div>
          {project.network_elements.length === 0 ? (
            <p className="text-xs text-muted-foreground italic mb-2">None yet.</p>
          ) : (
            <ul className="space-y-1 mb-2">
              {project.network_elements.map((ne) => {
                const cost = computed?.network_elements.find((c) => c.ne_id === ne.id)?.total ?? 0;
                const active = selectedPanel.kind === "ne" && selectedPanel.id === ne.id;
                return (
                  <li key={ne.id}>
                    <button
                      className={
                        "w-full flex items-start justify-between gap-2 rounded px-2 py-1.5 text-sm text-left " +
                        (active ? "bg-accent" : "hover:bg-muted")
                      }
                      onClick={() => setSelectedPanel({ kind: "ne", id: ne.id })}
                    >
                      <span className="flex-1 truncate">{ne.name}</span>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        {formatAUD(cost)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="space-y-1">
            <Button size="sm" variant="outline" className="w-full" onClick={() => handleAddNE("Station")}>
              + Station NE
            </Button>
            <Button size="sm" variant="outline" className="w-full" onClick={() => handleAddNE("Overhead line")}>
              + Overhead line NE
            </Button>
            <Button size="sm" variant="outline" className="w-full" onClick={() => handleAddNE("Underground Cable")}>
              + Underground Cable NE
            </Button>
          </div>
        </div>

        <div className="p-3 border-t">
          {computed && (
            <>
              <TotalsLine label="Direct" value={computed.project_direct} />
              <TotalsLine label="Indirect" value={computed.total_indirect} />
              <TotalsLine label="Total" value={computed.project_total_central} bold />
              <div className="text-xs text-muted-foreground mt-1">
                range {formatAUD(computed.project_total_low)} — {formatAUD(computed.project_total_high)}
              </div>
              <div className="mt-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs bg-primary/10 text-primary font-medium">
                {computed.estimate_class === "Mixed"
                  ? "Mixed class — review unknown risks"
                  : `${computed.estimate_class} ±${(computed.range_multiplier * 100).toFixed(0)}%`}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* --- Main --- */}
      <main className="flex-1 overflow-auto">
        <header className="sticky top-0 z-10 flex items-center justify-end gap-2 border-b bg-background px-4 py-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${project.id}/compare`)}>
            Compare
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${project.id}/sensitivity`)}>
            Sensitivity
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJson}>
            Save as JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!computed || project.network_elements.length === 0}
            title={project.network_elements.length === 0 ? "Add at least one network element to export." : undefined}
            onClick={() => {
              if (computed) downloadProjectXlsx(project, computed, library);
            }}
          >
            Export Excel
          </Button>
          <Button
            size="sm"
            disabled={!computed || project.network_elements.length === 0}
            title={project.network_elements.length === 0 ? "Add at least one network element to export." : undefined}
            onClick={() => {
              if (computed) downloadProjectPdf(project, computed, library);
            }}
          >
            Export PDF
          </Button>
        </header>

        <div className="p-6">
          {selectedPanel.kind === "assumptions" && (
            <AssumptionsPanel
              project={project}
              library={library}
              projectDirect={computed?.project_direct ?? 0}
              onChange={(m) => updateProject(project.id, m)}
            />
          )}

          {selectedPanel.kind === "indirect" && computed && (
            <IndirectPanel computed={computed} />
          )}

          {selectedPanel.kind === "ne" && selectedNe && selectedNeComp && (
            <div>
              <div className="mb-4 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newId = duplicateNetworkElement(project.id, selectedNe.id);
                    if (newId) setSelectedPanel({ kind: "ne", id: newId });
                  }}
                >
                  Duplicate NE
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm(`Delete network element "${selectedNe.name}"?`)) {
                      removeNetworkElement(project.id, selectedNe.id);
                      setSelectedPanel({ kind: "assumptions" });
                    }
                  }}
                >
                  Delete NE
                </Button>
              </div>
              <NetworkElementEditor
                project={project}
                ne={selectedNe}
                neComputation={selectedNeComp}
                library={library}
                onChange={(m) => updateNetworkElement(project.id, selectedNe.id, m)}
                onRename={(name) =>
                  updateNetworkElement(project.id, selectedNe.id, (n) => { n.name = name; })
                }
                onDescribe={(desc) =>
                  updateNetworkElement(project.id, selectedNe.id, (n) => { n.description = desc; })
                }
                onRemoveBuildingBlock={(idx) => removeBuildingBlock(project.id, selectedNe.id, idx)}
                onUpdateBuildingBlock={(idx, qty) =>
                  updateBuildingBlock(project.id, selectedNe.id, idx, { quantity: qty })
                }
                onAddBuildingBlock={(block, quantity) => {
                  // Lock NE category to first block's category
                  updateNetworkElement(project.id, selectedNe.id, (n) => {
                    if (n.building_blocks.length === 0) n.category = block.cat;
                  });
                  addBuildingBlock(project.id, selectedNe.id, {
                    library_block_id: block.id,
                    quantity,
                  });
                }}
              />
            </div>
          )}

          {/* --- Project cost breakdown (always visible at bottom) --- */}
          {computed && project.network_elements.length > 0 && (
            <ProjectCostBreakdown computed={computed} />
          )}
        </div>
      </main>
    </div>
  );
}

function TotalsLine({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={"flex items-baseline justify-between text-sm " + (bold ? "font-semibold" : "")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{formatAUD(value)}</span>
    </div>
  );
}

function IndirectPanel({ computed }: { computed: NonNullable<ReturnType<typeof computeProject>> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Indirect costs</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Indirect costs are computed from three selections — brownfield band, stakeholder
          sensitivity, contract delivery model — which are all set in the Project assumptions
          panel. Edit those to change the values below.
        </p>
        <table className="w-full text-sm font-mono">
          <tbody>
            {INDIRECT_COST_KEYS.map((k) => (
              <tr key={k} className="border-t">
                <td className="p-2">{INDIRECT_COST_LABELS[k]}</td>
                <td className="p-2 text-right">{formatAUD(computed.indirect_by_category[k])}</td>
              </tr>
            ))}
            <tr className="border-t font-semibold">
              <td className="p-2">Total indirect</td>
              <td className="p-2 text-right">{formatAUD(computed.total_indirect)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 text-xs text-muted-foreground">
          Resolved selections: {computed.indirect_selections.brownfield_band.scat} ·{" "}
          {computed.indirect_selections.brownfield_band.ttl} · {computed.indirect_selections.stakeholder.ttl} · {computed.indirect_selections.delivery_model.ttl}
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectCostBreakdown({ computed }: { computed: NonNullable<ReturnType<typeof computeProject>> }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Project cost breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="p-2">Network element</th>
                {DIRECT_COST_KEYS.map((k) => (
                  <th key={k} className="p-2 text-right" title={DIRECT_COST_LABELS[k]}>{k}</th>
                ))}
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {computed.network_elements.map((c) => (
                <tr key={c.ne_id} className="border-t">
                  <td className="p-2 font-sans">{c.ne_id}</td>
                  {DIRECT_COST_KEYS.map((k) => (
                    <td key={k} className="p-2 text-right">{formatAUD(c.total_by_category[k], 0)}</td>
                  ))}
                  <td className="p-2 text-right font-semibold">{formatAUD(c.total, 0)}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold">
                <td className="p-2 font-sans">Project direct</td>
                {DIRECT_COST_KEYS.map((k) => (
                  <td key={k} className="p-2 text-right">{formatAUD(computed.project_direct_by_category[k], 0)}</td>
                ))}
                <td className="p-2 text-right">{formatAUD(computed.project_direct, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Direct" value={computed.project_direct} />
          <Stat label="Indirect" value={computed.total_indirect} />
          <Stat label="Central" value={computed.project_total_central} />
          <Stat
            label={`Range (±${(computed.range_multiplier * 100).toFixed(0)}%)`}
            value={computed.project_total_high}
            sub={`low ${formatAUD(computed.project_total_low)}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold font-mono">{formatAUD(value)}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
