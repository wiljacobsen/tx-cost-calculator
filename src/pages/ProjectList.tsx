import { useNavigate } from "react-router-dom";
import { useProjectStore } from "@/store/projectStore";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { formatAUD } from "@/lib/utils";
import { computeProject } from "@/lib/calc";
import { getLibrary } from "@/lib/library";
import { useRef } from "react";
import type { Project } from "@/types/project";

export function ProjectList() {
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);
  const createProject = useProjectStore((s) => s.createProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const importProject = useProjectStore((s) => s.importProject);
  const duplicateProject = useProjectStore((s) => s.duplicateProject);
  const fileRef = useRef<HTMLInputElement>(null);
  const lib = getLibrary();

  const list = Object.values(projects).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  function handleNew() {
    const id = createProject("Untitled project");
    navigate(`/projects/${id}`);
  }

  function handleImport(file: File) {
    file.text().then((text) => {
      try {
        const data = JSON.parse(text) as Project;
        if (!data.network_elements || !data.project_assumptions) {
          alert("File doesn't look like a TCD project JSON.");
          return;
        }
        const id = importProject(data);
        navigate(`/projects/${id}`);
      } catch (err) {
        alert("Could not parse project JSON: " + (err as Error).message);
      }
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">TCD — Transmission Cost Calculator</h1>
            <p className="text-xs text-muted-foreground">
              Library {lib.metadata.library_version} · {lib.metadata.currency_year} {lib.metadata.currency}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              Load from JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = "";
              }}
            />
            <Button onClick={handleNew}>+ New project</Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {list.length === 0 ? (
          <Card className="mx-auto max-w-2xl">
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>
                The TCD tool produces Class 5b (±50%) or Class 5a (±30%) deterministic point
                estimates in 2021 AUD for NEM transmission projects (stations, overhead lines,
                underground cables). Create your first project to start building an estimate —
                add one or more network elements, pick building blocks, set project-level
                assumptions, and see the total update live.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleNew}>+ Create your first project</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => {
              const computed = computeProject(p, lib);
              return (
                <Card
                  key={p.id}
                  className="cursor-pointer transition hover:border-primary"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <CardHeader>
                    <CardTitle>{p.name || "Untitled project"}</CardTitle>
                    <CardDescription>
                      {p.network_elements.length} network element
                      {p.network_elements.length === 1 ? "" : "s"} · {p.project_assumptions.estimate_class}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      {formatAUD(computed.project_total_central)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      range {formatAUD(computed.project_total_low)} —{" "}
                      {formatAUD(computed.project_total_high)}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newId = duplicateProject(p.id);
                          if (newId) navigate(`/projects/${newId}`);
                        }}
                      >
                        Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete project "${p.name}"?`)) deleteProject(p.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
