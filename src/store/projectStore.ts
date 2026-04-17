import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Project,
  NetworkElement,
  ProjectAssumptions,
  SelectedBuildingBlock,
} from "@/types/project";
import type { TopCategory } from "@/types/library";
import { DEFAULT_LIBRARY_VERSION } from "@/lib/library";

function uid(prefix: string): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function defaultAssumptions(): ProjectAssumptions {
  return {
    jurisdiction: { state: null, subregion: null },
    delivery_model: "EPC contract",
    project_size_band: "auto",
    greenfield_status: "Brownfield",
    stakeholder_sensitivity: "Commensurate with land use",
    macroeconomic: "BAU",
    market_activity: "BAU",
    estimate_class: "Class 5b",
  };
}

export function blankProject(name: string = "Untitled project"): Project {
  const now = new Date().toISOString();
  return {
    id: uid("proj"),
    name,
    description: "",
    library_version: DEFAULT_LIBRARY_VERSION,
    created_at: now,
    updated_at: now,
    version: 1,
    project_assumptions: defaultAssumptions(),
    network_elements: [],
  };
}

function blankNetworkElement(category: TopCategory): NetworkElement {
  return {
    id: uid("ne"),
    name: "New " + category + " element",
    description: "",
    category,
    building_blocks: [],
    attribute_overrides: {},
    known_risk_overrides: {},
    unknown_risk_overrides: {},
  };
}

interface ProjectStore {
  projects: Record<string, Project>;
  createProject: (name?: string) => string;
  deleteProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  updateProject: (id: string, mutator: (p: Project) => void) => void;
  duplicateProject: (id: string) => string | null;
  importProject: (p: Project) => string;

  // NE operations
  addNetworkElement: (projectId: string, category: TopCategory) => string | null;
  removeNetworkElement: (projectId: string, neId: string) => void;
  duplicateNetworkElement: (projectId: string, neId: string) => string | null;
  updateNetworkElement: (projectId: string, neId: string, mutator: (ne: NetworkElement) => void) => void;

  // BB operations
  addBuildingBlock: (projectId: string, neId: string, sel: SelectedBuildingBlock) => void;
  updateBuildingBlock: (projectId: string, neId: string, index: number, patch: Partial<SelectedBuildingBlock>) => void;
  removeBuildingBlock: (projectId: string, neId: string, index: number) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: {},
      createProject: (name) => {
        const p = blankProject(name ?? "Untitled project");
        set((s) => ({ projects: { ...s.projects, [p.id]: p } }));
        return p.id;
      },
      deleteProject: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.projects;
          return { projects: rest };
        }),
      renameProject: (id, name) =>
        get().updateProject(id, (p) => {
          p.name = name;
        }),
      updateProject: (id, mutator) =>
        set((s) => {
          const cur = s.projects[id];
          if (!cur) return s;
          const next = JSON.parse(JSON.stringify(cur)) as Project;
          mutator(next);
          next.version = cur.version + 1;
          next.updated_at = new Date().toISOString();
          return { projects: { ...s.projects, [id]: next } };
        }),
      duplicateProject: (id) => {
        const p = get().projects[id];
        if (!p) return null;
        const copy = JSON.parse(JSON.stringify(p)) as Project;
        copy.id = uid("proj");
        copy.name = p.name + " (copy)";
        copy.created_at = new Date().toISOString();
        copy.updated_at = copy.created_at;
        copy.version = 1;
        set((s) => ({ projects: { ...s.projects, [copy.id]: copy } }));
        return copy.id;
      },
      importProject: (p) => {
        const imported = { ...p, id: p.id || uid("proj") };
        set((s) => ({ projects: { ...s.projects, [imported.id]: imported } }));
        return imported.id;
      },

      addNetworkElement: (projectId, category) => {
        const ne = blankNetworkElement(category);
        get().updateProject(projectId, (p) => {
          p.network_elements.push(ne);
        });
        return ne.id;
      },
      removeNetworkElement: (projectId, neId) =>
        get().updateProject(projectId, (p) => {
          p.network_elements = p.network_elements.filter((n) => n.id !== neId);
        }),
      duplicateNetworkElement: (projectId, neId) => {
        let newId: string | null = null;
        get().updateProject(projectId, (p) => {
          const src = p.network_elements.find((n) => n.id === neId);
          if (!src) return;
          const copy = JSON.parse(JSON.stringify(src)) as NetworkElement;
          copy.id = uid("ne");
          copy.name = src.name + " (copy)";
          p.network_elements.push(copy);
          newId = copy.id;
        });
        return newId;
      },
      updateNetworkElement: (projectId, neId, mutator) =>
        get().updateProject(projectId, (p) => {
          const ne = p.network_elements.find((n) => n.id === neId);
          if (ne) mutator(ne);
        }),

      addBuildingBlock: (projectId, neId, sel) =>
        get().updateNetworkElement(projectId, neId, (ne) => {
          ne.building_blocks.push(sel);
        }),
      updateBuildingBlock: (projectId, neId, index, patch) =>
        get().updateNetworkElement(projectId, neId, (ne) => {
          if (index >= 0 && index < ne.building_blocks.length) {
            ne.building_blocks[index] = { ...ne.building_blocks[index], ...patch };
          }
        }),
      removeBuildingBlock: (projectId, neId, index) =>
        get().updateNetworkElement(projectId, neId, (ne) => {
          ne.building_blocks.splice(index, 1);
        }),
    }),
    {
      name: "tcd-projects-v1",
      version: 1,
    },
  ),
);

export { defaultAssumptions };
