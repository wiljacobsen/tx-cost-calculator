import { useState, useMemo } from "react";
import type { Library, BuildingBlock } from "@/types/library";
import { DIRECT_COST_KEYS, DIRECT_COST_LABELS, topCategoryFromAdjustmentCat, topCategoryFromRiskCat, riskKindFromRiskCat } from "@/types/library";
import type { Project, NetworkElement, NetworkElementComputation } from "@/types/project";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { BuildingBlockPicker } from "./BuildingBlockPicker";
import { formatAUD, formatFactor } from "@/lib/utils";
import {
  NE_ONLY_ATTRIBUTE_SCATS,
  NE_ONLY_KNOWN_RISK_SCATS,
  UNKNOWN_RISK_SCATS,
  resolveAttributeSelections,
  resolveKnownRiskSelections,
  resolveUnknownRiskSelections,
} from "@/lib/inheritance";

export function NetworkElementEditor({
  project,
  ne,
  neComputation,
  library,
  onChange,
  onRemoveBuildingBlock,
  onUpdateBuildingBlock,
  onAddBuildingBlock,
  onRename,
  onDescribe,
}: {
  project: Project;
  ne: NetworkElement;
  neComputation: NetworkElementComputation;
  library: Library;
  onChange: (mutator: (ne: NetworkElement) => void) => void;
  onRemoveBuildingBlock: (index: number) => void;
  onUpdateBuildingBlock: (index: number, quantity: number) => void;
  onAddBuildingBlock: (block: BuildingBlock, quantity: number) => void;
  onRename: (name: string) => void;
  onDescribe: (description: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const blockIndex = useMemo(() => {
    const m = new Map<number, BuildingBlock>();
    for (const b of library.building_blocks) m.set(b.id, b);
    return m;
  }, [library]);

  const lockedCategory = ne.building_blocks.length > 0 ? ne.category : null;

  return (
    <div>
      <div className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Input
              value={ne.name}
              onChange={(e) => onRename(e.target.value)}
              className="text-lg font-semibold mb-1"
            />
            <Input
              value={ne.description}
              placeholder="Description (optional)"
              onChange={(e) => onDescribe(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-muted-foreground">Network element total</div>
            <div className="text-2xl font-semibold font-mono">
              {formatAUD(neComputation.total)}
            </div>
            <div className="text-xs text-muted-foreground">Category: {ne.category}</div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="blocks">
        <TabsList>
          <TabsTrigger value="blocks">Building Blocks</TabsTrigger>
          <TabsTrigger value="overrides">Overrides</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="blocks">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Building blocks</CardTitle>
                  <CardDescription>
                    Pick from the {library.metadata.library_version} library. All blocks in one
                    network element must share a top-level category ({ne.category}).
                  </CardDescription>
                </div>
                <Button onClick={() => setPickerOpen(true)}>+ Add building block</Button>
              </div>
            </CardHeader>
            <CardContent>
              {ne.building_blocks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No building blocks yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2">Subcategory</th>
                        <th className="p-2">kV</th>
                        <th className="p-2">Detail</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2">Unit</th>
                        <th className="p-2 text-right">Unit cost</th>
                        <th className="p-2 text-right">Line total</th>
                        <th className="p-2 text-right w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ne.building_blocks.map((bb, idx) => {
                        const block = blockIndex.get(bb.library_block_id);
                        if (!block) {
                          return (
                            <tr key={idx}>
                              <td colSpan={8} className="p-2 text-destructive">
                                Missing library block {bb.library_block_id}
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{block.scat}</td>
                            <td className="p-2">{block.kv.trim()}</td>
                            <td className="p-2">{block.ttl}</td>
                            <td className="p-2 text-right">
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={bb.quantity}
                                onChange={(e) => onUpdateBuildingBlock(idx, Number(e.target.value))}
                                className="w-24 h-7 text-right inline-block"
                              />
                            </td>
                            <td className="p-2">{block.un}</td>
                            <td className="p-2 text-right font-mono">{formatAUD(block.tbbc, 2)}</td>
                            <td className="p-2 text-right font-mono">
                              {formatAUD(block.tbbc * bb.quantity, 2)}
                            </td>
                            <td className="p-2 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onRemoveBuildingBlock(idx)}
                              >
                                Remove
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <BuildingBlockPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            library={library}
            lockedCategory={lockedCategory}
            onAdd={onAddBuildingBlock}
          />
        </TabsContent>

        <TabsContent value="overrides">
          <OverridesTab
            project={project}
            ne={ne}
            library={library}
            onChange={onChange}
          />
        </TabsContent>

        <TabsContent value="breakdown">
          <BreakdownTab computation={neComputation} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --------------------------------------------------------------- Overrides ---

function OverridesTab({
  project,
  ne,
  library,
  onChange,
}: {
  project: Project;
  ne: NetworkElement;
  library: Library;
  onChange: (mutator: (ne: NetworkElement) => void) => void;
}) {
  const resolvedAttrs = resolveAttributeSelections(ne, project.project_assumptions);
  const resolvedKnown = resolveKnownRiskSelections(ne, project.project_assumptions);
  const resolvedUnknown = resolveUnknownRiskSelections(ne, project.project_assumptions);

  // Build attribute options by SCAT for the NE's category
  const attrOptionsBySCAT = new Map<string, string[]>();
  for (const a of library.adjustments) {
    if (topCategoryFromAdjustmentCat(a.cat) !== ne.category) continue;
    const arr = attrOptionsBySCAT.get(a.scat) ?? [];
    if (!arr.includes(a.ttl)) arr.push(a.ttl);
    attrOptionsBySCAT.set(a.scat, arr);
  }

  // Build risk options
  const knownOptionsBySCAT = new Map<string, string[]>();
  const unknownOptionsBySCAT = new Map<string, string[]>();
  for (const r of library.risks) {
    if (topCategoryFromRiskCat(r.cat) !== ne.category) continue;
    const target = riskKindFromRiskCat(r.cat) === "known" ? knownOptionsBySCAT : unknownOptionsBySCAT;
    const arr = target.get(r.scat) ?? [];
    if (!arr.includes(r.ttl)) arr.push(r.ttl);
    target.set(r.scat, arr);
  }

  const neOnlyAttrs = NE_ONLY_ATTRIBUTE_SCATS[ne.category];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Project attributes</CardTitle>
          <CardDescription>
            Each selection adjusts the baseline cost. Inherited values follow the project's
            assumptions; overrides replace them for this network element only. Element-only
            attributes must be set per network element.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {Array.from(attrOptionsBySCAT.entries()).map(([scat, options]) => {
            const isOverridden = scat in ne.attribute_overrides;
            const isInheritable = ["Jurisdiction", "Contract delivery model", "Greenfield or brownfield"].includes(scat);
            const isNeOnly = neOnlyAttrs.includes(scat);
            const current = resolvedAttrs[scat] ?? "";
            return (
              <label key={scat} className="text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">{scat}</span>
                  <span className="text-xs text-muted-foreground">
                    {isNeOnly
                      ? (current ? "set" : "not set")
                      : isOverridden
                        ? "override"
                        : isInheritable ? "inherited" : "unset"}
                  </span>
                </div>
                <Select
                  value={current}
                  onChange={(e) =>
                    onChange((n) => {
                      if (e.target.value === "" && !isNeOnly) {
                        delete n.attribute_overrides[scat];
                      } else {
                        n.attribute_overrides[scat] = e.target.value;
                      }
                    })
                  }
                >
                  {!isNeOnly && <option value="">— inherit —</option>}
                  {isNeOnly && <option value="">— not set (no adjustment) —</option>}
                  {options.map((o) => (<option key={o} value={o}>{o}</option>))}
                </Select>
              </label>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Known risks</CardTitle>
          <CardDescription>
            Known risks default to <strong>BAU</strong> if not set. Only Macroeconomic and
            Market activity inherit from project assumptions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {Array.from(knownOptionsBySCAT.entries()).map(([scat, options]) => {
            const isOverridden = scat in ne.known_risk_overrides;
            const isInheritable = scat === "Macroeconomic influence" || scat === "Market activity";
            const isNeOnly = NE_ONLY_KNOWN_RISK_SCATS.includes(scat as (typeof NE_ONLY_KNOWN_RISK_SCATS)[number]);
            const current = resolvedKnown[scat] ?? "BAU";
            return (
              <label key={scat} className="text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">{scat}</span>
                  <span className="text-xs text-muted-foreground">
                    {isOverridden ? "override" : isInheritable ? "inherited" : isNeOnly ? "defaulted to BAU" : "default"}
                  </span>
                </div>
                <Select
                  value={current}
                  onChange={(e) =>
                    onChange((n) => {
                      const defaultTtl = isInheritable
                        ? (scat === "Macroeconomic influence"
                            ? project.project_assumptions.macroeconomic
                            : project.project_assumptions.market_activity)
                        : "BAU";
                      if (e.target.value === defaultTtl && !isOverridden) {
                        delete n.known_risk_overrides[scat];
                      } else {
                        n.known_risk_overrides[scat] = e.target.value;
                      }
                    })
                  }
                >
                  {options.map((o) => (<option key={o} value={o}>{o}</option>))}
                </Select>
              </label>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unknown risks (estimate class)</CardTitle>
          <CardDescription>
            All four unknown-risk subcategories inherit from the project's estimate class.
            Overriding any of them here will make this project a "Mixed class" estimate.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {UNKNOWN_RISK_SCATS.map((scat) => {
            const options = unknownOptionsBySCAT.get(scat) ?? [];
            const current = resolvedUnknown[scat] ?? project.project_assumptions.estimate_class;
            const isOverridden = scat in ne.unknown_risk_overrides;
            return (
              <label key={scat} className="text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">{scat}</span>
                  <span className="text-xs text-muted-foreground">
                    {isOverridden ? "override" : "inherited"}
                  </span>
                </div>
                <Select
                  value={current}
                  onChange={(e) =>
                    onChange((n) => {
                      if (e.target.value.trim() === project.project_assumptions.estimate_class.trim()) {
                        delete n.unknown_risk_overrides[scat];
                      } else {
                        n.unknown_risk_overrides[scat] = e.target.value;
                      }
                    })
                  }
                >
                  {options.map((o) => (<option key={o} value={o}>{o}</option>))}
                </Select>
              </label>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------- Breakdown ---

function BreakdownTab({ computation }: { computation: NetworkElementComputation }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost waterfall</CardTitle>
        <CardDescription>
          Per-category breakdown: baseline → adjusted baseline → known risk allowance →
          unknown risk allowance → total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="p-2">Category</th>
                {DIRECT_COST_KEYS.map((k) => (
                  <th key={k} className="p-2 text-right" title={DIRECT_COST_LABELS[k]}>{k}</th>
                ))}
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <Row label="Baseline" values={computation.baseline} />
              <Row label="Adj factor" values={computation.adjustment_factor} isFactor />
              <Row label="Adjusted baseline" values={computation.adjusted_baseline} />
              <Row label="Known risk factor" values={computation.known_risk_factor} isFactor />
              <Row label="Known risk allowance" values={computation.known_risk_allowance} />
              <Row label="Unknown risk factor" values={computation.unknown_risk_factor} isFactor />
              <Row label="Unknown risk allowance" values={computation.unknown_risk_allowance} />
              <Row label="Total" values={computation.total_by_category} bold />
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  values,
  isFactor,
  bold,
}: {
  label: string;
  values: Record<string, number>;
  isFactor?: boolean;
  bold?: boolean;
}) {
  const total = DIRECT_COST_KEYS.reduce((s, k) => s + (values[k] ?? 0), 0);
  return (
    <tr className={"border-t " + (bold ? "font-semibold" : "")}>
      <td className="p-2 font-sans">{label}</td>
      {DIRECT_COST_KEYS.map((k) => (
        <td key={k} className="p-2 text-right">
          {isFactor ? formatFactor(values[k] ?? 0) : formatAUD(values[k] ?? 0, 0)}
        </td>
      ))}
      <td className="p-2 text-right">
        {isFactor ? "" : formatAUD(total, 0)}
      </td>
    </tr>
  );
}
