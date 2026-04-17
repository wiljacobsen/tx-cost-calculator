import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Cell, ReferenceLine, Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import { useProjectStore } from "@/store/projectStore";
import { getLibrary } from "@/lib/library";
import { computeSensitivity } from "@/lib/sensitivity";
import { computeProject } from "@/lib/calc";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { formatAUD } from "@/lib/utils";
import { ESTIMATE_CLASSES } from "@/types/project";

export function Sensitivity() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.projects[id]);
  const library = getLibrary();

  // What-if scratchpad: temporary estimate_class override
  const [whatIfClass, setWhatIfClass] = useState<string>("");

  const sensitivity = useMemo(() => {
    if (!project) return null;
    return computeSensitivity(project, library);
  }, [project, library]);

  const scratchTotal = useMemo(() => {
    if (!project) return null;
    const p = JSON.parse(JSON.stringify(project)) as typeof project;
    if (whatIfClass) p.project_assumptions.estimate_class = whatIfClass as typeof p.project_assumptions.estimate_class;
    return computeProject(p, library).project_total_central;
  }, [project, whatIfClass, library]);

  if (!project) {
    return (
      <div className="p-8">
        <Button onClick={() => navigate("/")}>← Back to projects</Button>
        <p className="mt-2">Project not found.</p>
      </div>
    );
  }

  const drivers = (sensitivity?.drivers ?? []).slice(0, 15);
  const base = sensitivity?.base_total ?? 0;

  // Prepare chart data: x = delta, y = label, sorted by magnitude descending so top drivers appear at top
  const chartData = drivers
    .map((d, i) => ({
      name: d.label,
      value: d.delta,
      change: d.change,
      idx: i,
      total: d.alternative_total,
    }))
    .reverse(); // bottom-up order in chart

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex items-center justify-between py-3">
          <div>
            <button className="text-xs text-muted-foreground hover:underline mb-1 block" onClick={() => navigate(`/projects/${id}`)}>
              ← Back to {project.name}
            </button>
            <h1 className="text-lg font-semibold">Sensitivity — {project.name}</h1>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Central estimate</div>
            <div className="text-xl font-semibold font-mono">{formatAUD(base)}</div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Top drivers (tornado)</CardTitle>
            <CardDescription>
              Each bar shows the change in project total central cost if that single assumption
              or risk is flipped to its most-impactful alternative. Labels are read top-down
              in order of largest absolute impact.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {drivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No drivers — add at least one network element with building blocks to compute sensitivity.
              </p>
            ) : (
              <div style={{ width: "100%", height: Math.max(320, drivers.length * 28) }}>
                <ResponsiveContainer>
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 10, right: 80, left: 220, bottom: 10 }}
                  >
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => formatAUD(v)}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={220}
                      tick={{ fontSize: 12 }}
                    />
                    <RTooltip
                      formatter={(v: number | string) => formatAUD(Number(v))}
                      labelFormatter={(_label, payload) => {
                        const d = payload?.[0]?.payload as { change?: string; total?: number };
                        return `${d?.change ?? ""} → total ${formatAUD(d?.total ?? 0)}`;
                      }}
                    />
                    <ReferenceLine x={0} stroke="#888" />
                    <Bar dataKey="value">
                      {chartData.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.value >= 0 ? "hsl(0 72% 55%)" : "hsl(142 71% 35%)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What-if scratchpad</CardTitle>
            <CardDescription>
              Try alternative values without committing them to the project.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <div className="mb-1 font-medium">Estimate class</div>
              <Select
                value={whatIfClass || project.project_assumptions.estimate_class}
                onChange={(e) =>
                  setWhatIfClass(
                    e.target.value === project.project_assumptions.estimate_class ? "" : e.target.value,
                  )
                }
              >
                {ESTIMATE_CLASSES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </Select>
            </label>
            <div className="md:col-span-2 rounded border p-3">
              <div className="text-xs text-muted-foreground">What-if total</div>
              <div className="text-2xl font-semibold font-mono">{formatAUD(scratchTotal ?? 0)}</div>
              <div className="text-xs text-muted-foreground">
                Base: {formatAUD(base)} · Δ {formatAUD((scratchTotal ?? 0) - base)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All drivers</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Driver</th>
                  <th className="p-2">Change</th>
                  <th className="p-2 text-right">Δ</th>
                  <th className="p-2 text-right">Alternative total</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity?.drivers.map((d, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{d.label}</td>
                    <td className="p-2 text-muted-foreground">{d.change}</td>
                    <td className="p-2 text-right font-mono">{formatAUD(d.delta)}</td>
                    <td className="p-2 text-right font-mono">{formatAUD(d.alternative_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
