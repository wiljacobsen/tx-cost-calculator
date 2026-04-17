/**
 * PDF export using @react-pdf/renderer. Five sections:
 *   1. Cover — project name, total, range, key assumptions
 *   2. Summary — 9-column direct cost × NE + indirect breakdown
 *   3. Per-network-element pages
 *   4. Sensitivity appendix — top 8 drivers
 *   5. Audit trail — full input capture with library version
 */
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { Project, ProjectComputation } from "@/types/project";
import type { Library } from "@/types/library";
import {
  DIRECT_COST_KEYS,
  INDIRECT_COST_KEYS,
  INDIRECT_COST_LABELS,
} from "@/types/library";
import {
  effectiveAttributes,
  effectiveKnownRisks,
  effectiveUnknownRisks,
} from "@/lib/inheritance";
import { computeSensitivity } from "@/lib/sensitivity";
import { formatAUD, formatFactor, sanitiseFilename } from "@/lib/utils";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica" },
  h1: { fontSize: 20, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 14, marginTop: 14, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  h3: { fontSize: 11, marginTop: 10, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  muted: { color: "#666" },
  big: { fontSize: 28, fontFamily: "Helvetica-Bold", marginTop: 10 },
  smallMuted: { fontSize: 8, color: "#666" },

  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 2 },
  cell: { paddingHorizontal: 2 },
  cellR: { paddingHorizontal: 2, textAlign: "right" },
  cellHdr: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#555" },

  tableHeader: { borderBottomWidth: 1, borderBottomColor: "#000", paddingBottom: 2, flexDirection: "row" },

  pillBox: { flexDirection: "row", marginTop: 8 },
  pill: { borderWidth: 0.5, borderColor: "#999", paddingVertical: 3, paddingHorizontal: 6, marginRight: 4, borderRadius: 4, fontSize: 8 },

  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 8, color: "#666", textAlign: "center" },
});

function PageFooter({ library }: { library: Library }) {
  return (
    <Text style={s.footer} fixed>
      Generated with TCD tool · library {library.metadata.library_version} · {library.metadata.content_hash.slice(0, 20)}…
    </Text>
  );
}

export function ProjectPdf({
  project,
  computation,
  library,
}: {
  project: Project;
  computation: ProjectComputation;
  library: Library;
}) {
  const sensitivity = computeSensitivity(project, library);
  const topDrivers = sensitivity.drivers.slice(0, 8);
  const blockIndex = new Map(library.building_blocks.map((b) => [b.id, b]));

  // --- Cover page -----------------------------------------------------
  return (
    <Document>
      {/* Cover */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{project.name || "Untitled project"}</Text>
        {project.description ? <Text style={s.muted}>{project.description}</Text> : null}
        <Text style={s.smallMuted}>
          Class 5b/5a point estimate · 2021 Australian dollars, real terms
        </Text>

        <Text style={s.big}>{formatAUD(computation.project_total_central)}</Text>
        <Text style={s.smallMuted}>
          Range: {formatAUD(computation.project_total_low)} — {formatAUD(computation.project_total_high)} ·{" "}
          {computation.estimate_class} ±{(computation.range_multiplier * 100).toFixed(0)}%
        </Text>

        <Text style={s.h2}>Key assumptions</Text>
        <KVRows rows={[
          ["Jurisdiction", project.project_assumptions.jurisdiction.subregion
            ?? project.project_assumptions.jurisdiction.state ?? "—"],
          ["Greenfield status", project.project_assumptions.greenfield_status],
          ["Delivery model", project.project_assumptions.delivery_model],
          ["Stakeholder sensitivity", project.project_assumptions.stakeholder_sensitivity],
          ["Project size band", String(project.project_assumptions.project_size_band)],
          ["Macroeconomic", project.project_assumptions.macroeconomic],
          ["Market activity", project.project_assumptions.market_activity],
          ["Estimate class", project.project_assumptions.estimate_class],
          ["Library", library.metadata.library_version + " (" + library.metadata.currency_year + " AUD)"],
          ["Network elements", String(project.network_elements.length)],
        ]} />

        <PageFooter library={library} />
      </Page>

      {/* Summary */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Summary</Text>

        <Text style={s.h2}>Direct cost by network element</Text>
        <View style={s.tableHeader}>
          <Text style={[s.cell, s.cellHdr, { flex: 3 }]}>Network element</Text>
          {DIRECT_COST_KEYS.map((k) => (
            <Text key={k} style={[s.cellR, s.cellHdr, { flex: 1 }]}>{k}</Text>
          ))}
          <Text style={[s.cellR, s.cellHdr, { flex: 1.2 }]}>Total</Text>
        </View>
        {computation.network_elements.map((c) => {
          const ne = project.network_elements.find((n) => n.id === c.ne_id);
          return (
            <View key={c.ne_id} style={s.row}>
              <Text style={[s.cell, { flex: 3 }]}>{ne?.name ?? c.ne_id}</Text>
              {DIRECT_COST_KEYS.map((k) => (
                <Text key={k} style={[s.cellR, { flex: 1 }]}>{fmt(c.total_by_category[k])}</Text>
              ))}
              <Text style={[s.cellR, { flex: 1.2, fontFamily: "Helvetica-Bold" }]}>{fmt(c.total)}</Text>
            </View>
          );
        })}
        <View style={[s.row, { borderTopWidth: 1, borderTopColor: "#000" }]}>
          <Text style={[s.cell, { flex: 3, fontFamily: "Helvetica-Bold" }]}>Project direct</Text>
          {DIRECT_COST_KEYS.map((k) => (
            <Text key={k} style={[s.cellR, { flex: 1, fontFamily: "Helvetica-Bold" }]}>
              {fmt(computation.project_direct_by_category[k])}
            </Text>
          ))}
          <Text style={[s.cellR, { flex: 1.2, fontFamily: "Helvetica-Bold" }]}>
            {fmt(computation.project_direct)}
          </Text>
        </View>

        <Text style={s.h2}>Indirect costs</Text>
        {INDIRECT_COST_KEYS.map((k) => (
          <View key={k} style={s.row}>
            <Text style={[s.cell, { flex: 4 }]}>{INDIRECT_COST_LABELS[k]}</Text>
            <Text style={[s.cellR, { flex: 1 }]}>{fmt(computation.indirect_by_category[k])}</Text>
          </View>
        ))}
        <View style={[s.row, { borderTopWidth: 1, borderTopColor: "#000" }]}>
          <Text style={[s.cell, { flex: 4, fontFamily: "Helvetica-Bold" }]}>Total indirect</Text>
          <Text style={[s.cellR, { flex: 1, fontFamily: "Helvetica-Bold" }]}>
            {fmt(computation.total_indirect)}
          </Text>
        </View>

        <View style={[s.row, { marginTop: 10 }]}>
          <Text style={[s.cell, { flex: 4, fontFamily: "Helvetica-Bold" }]}>
            Total expected project cost (central)
          </Text>
          <Text style={[s.cellR, { flex: 1, fontFamily: "Helvetica-Bold" }]}>
            {fmt(computation.project_total_central)}
          </Text>
        </View>
        <View style={s.row}>
          <Text style={[s.cell, { flex: 4 }]}>Range low / high</Text>
          <Text style={[s.cellR, { flex: 1 }]}>
            {fmt(computation.project_total_low)} / {fmt(computation.project_total_high)}
          </Text>
        </View>

        <PageFooter library={library} />
      </Page>

      {/* Per-NE pages */}
      {project.network_elements.map((ne) => {
        const comp = computation.network_elements.find((c) => c.ne_id === ne.id);
        if (!comp) return null;
        return (
          <Page key={ne.id} size="A4" style={s.page}>
            <Text style={s.h1}>{ne.name}</Text>
            <Text style={s.muted}>{ne.category} · {ne.description || "(no description)"}</Text>
            <Text style={s.big}>{formatAUD(comp.total)}</Text>

            <Text style={s.h2}>Building blocks</Text>
            <View style={s.tableHeader}>
              <Text style={[s.cell, s.cellHdr, { flex: 0.4 }]}>ID</Text>
              <Text style={[s.cell, s.cellHdr, { flex: 1.2 }]}>Subcategory</Text>
              <Text style={[s.cell, s.cellHdr, { flex: 0.4 }]}>kV</Text>
              <Text style={[s.cell, s.cellHdr, { flex: 2.5 }]}>Detail</Text>
              <Text style={[s.cellR, s.cellHdr, { flex: 0.4 }]}>Qty</Text>
              <Text style={[s.cell, s.cellHdr, { flex: 0.4 }]}>Unit</Text>
              <Text style={[s.cellR, s.cellHdr, { flex: 1 }]}>Unit cost</Text>
              <Text style={[s.cellR, s.cellHdr, { flex: 1 }]}>Line total</Text>
            </View>
            {ne.building_blocks.map((bb, i) => {
              const b = blockIndex.get(bb.library_block_id);
              if (!b) return null;
              return (
                <View key={i} style={s.row}>
                  <Text style={[s.cell, { flex: 0.4 }]}>{b.id}</Text>
                  <Text style={[s.cell, { flex: 1.2 }]}>{b.scat}</Text>
                  <Text style={[s.cell, { flex: 0.4 }]}>{b.kv.trim()}</Text>
                  <Text style={[s.cell, { flex: 2.5 }]}>{b.ttl}</Text>
                  <Text style={[s.cellR, { flex: 0.4 }]}>{bb.quantity}</Text>
                  <Text style={[s.cell, { flex: 0.4 }]}>{b.un}</Text>
                  <Text style={[s.cellR, { flex: 1 }]}>{fmt(b.tbbc)}</Text>
                  <Text style={[s.cellR, { flex: 1 }]}>{fmt(b.tbbc * bb.quantity)}</Text>
                </View>
              );
            })}

            <Text style={s.h2}>Selected attributes, known and unknown risks</Text>
            <FactorTable
              rows={effectiveAttributes(library, ne, project.project_assumptions).map((a) => ({
                scat: a.scat,
                ttl: a.ttl,
                factor: a.factor,
              }))}
              title="Attributes"
            />
            <FactorTable
              rows={effectiveKnownRisks(library, ne, project.project_assumptions).map((r) => ({
                scat: r.scat,
                ttl: r.ttl,
                factor: r.factor,
              }))}
              title="Known risks"
            />
            <FactorTable
              rows={effectiveUnknownRisks(library, ne, project.project_assumptions).map((r) => ({
                scat: r.scat,
                ttl: r.ttl,
                factor: r.factor,
              }))}
              title="Unknown risks"
            />

            <Text style={s.h3}>Cost waterfall</Text>
            <KVRows rows={[
              ["Baseline", fmt(sumDir(comp.baseline))],
              ["Adjusted baseline", fmt(sumDir(comp.adjusted_baseline))],
              ["Known risk allowance", fmt(sumDir(comp.known_risk_allowance))],
              ["Unknown risk allowance", fmt(sumDir(comp.unknown_risk_allowance))],
              ["Total", fmt(comp.total)],
            ]} />

            <PageFooter library={library} />
          </Page>
        );
      })}

      {/* Sensitivity appendix */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Sensitivity</Text>
        <Text style={s.muted}>
          Top {topDrivers.length} drivers (sorted by absolute impact). Each row shows the change
          in project total central if that single assumption/risk is flipped to its most-impactful
          alternative.
        </Text>
        <View style={[s.tableHeader, { marginTop: 10 }]}>
          <Text style={[s.cell, s.cellHdr, { flex: 3 }]}>Driver</Text>
          <Text style={[s.cell, s.cellHdr, { flex: 3 }]}>Change</Text>
          <Text style={[s.cellR, s.cellHdr, { flex: 1.2 }]}>Δ total</Text>
          <Text style={[s.cellR, s.cellHdr, { flex: 1.2 }]}>Alt total</Text>
        </View>
        {topDrivers.map((d, i) => (
          <View key={i} style={s.row}>
            <Text style={[s.cell, { flex: 3 }]}>{d.label}</Text>
            <Text style={[s.cell, { flex: 3, color: "#555" }]}>{d.change}</Text>
            <Text style={[s.cellR, { flex: 1.2 }]}>{fmt(d.delta)}</Text>
            <Text style={[s.cellR, { flex: 1.2 }]}>{fmt(d.alternative_total)}</Text>
          </View>
        ))}
        <PageFooter library={library} />
      </Page>

      {/* Audit trail */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Audit trail</Text>
        <Text style={s.muted}>
          All inputs captured at time of export. Library bundle content_hash locks the cost data
          to a specific immutable version; reproducing this estimate requires the same library
          version and the same inputs.
        </Text>
        <Text style={s.h3}>Library</Text>
        <KVRows rows={[
          ["Version", library.metadata.library_version],
          ["Source file", library.metadata.source_file],
          ["Currency year", String(library.metadata.currency_year)],
          ["Content hash", library.metadata.content_hash],
          ["Extracted at", library.metadata.extracted_at],
          ["Rows — building blocks", String(library.metadata.row_counts["building_blocks.csv"])],
          ["Rows — adjustments", String(library.metadata.row_counts["adjustments.csv"])],
          ["Rows — risks", String(library.metadata.row_counts["risks.csv"])],
          ["Rows — indirect", String(library.metadata.row_counts["indirect_costs.csv"])],
        ]} />

        <Text style={s.h3}>Project</Text>
        <KVRows rows={[
          ["Project id", project.id],
          ["Created", project.created_at],
          ["Updated", project.updated_at],
          ["Version", String(project.version)],
          ["Library version referenced", project.library_version],
        ]} />

        <Text style={s.h3}>Indirect selections</Text>
        <KVRows rows={[
          ["Brownfield band", computation.indirect_selections.brownfield_band.scat +
            " · " + computation.indirect_selections.brownfield_band.ttl],
          ["Stakeholder", computation.indirect_selections.stakeholder.ttl],
          ["Delivery model", computation.indirect_selections.delivery_model.ttl],
        ]} />

        <PageFooter library={library} />
      </Page>
    </Document>
  );
}

function fmt(v: number): string {
  return formatAUD(v);
}

function sumDir(obj: Record<string, number>): number {
  return DIRECT_COST_KEYS.reduce((acc, k) => acc + (obj[k] ?? 0), 0);
}

function KVRows({ rows }: { rows: [string, string][] }) {
  return (
    <View>
      {rows.map(([k, v], i) => (
        <View key={i} style={s.row}>
          <Text style={[s.cell, { flex: 1.5, color: "#555" }]}>{k}</Text>
          <Text style={[s.cell, { flex: 3 }]}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function FactorTable({
  rows,
  title,
}: {
  rows: { scat: string; ttl: string; factor: Record<string, number> }[];
  title: string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={s.h3}>{title}</Text>
      <View style={s.tableHeader}>
        <Text style={[s.cell, s.cellHdr, { flex: 2 }]}>SCAT</Text>
        <Text style={[s.cell, s.cellHdr, { flex: 2 }]}>TTL</Text>
        {DIRECT_COST_KEYS.map((k) => (
          <Text key={k} style={[s.cellR, s.cellHdr, { flex: 0.7 }]}>{k}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.row}>
          <Text style={[s.cell, { flex: 2 }]}>{r.scat}</Text>
          <Text style={[s.cell, { flex: 2 }]}>{r.ttl}</Text>
          {DIRECT_COST_KEYS.map((k) => (
            <Text key={k} style={[s.cellR, { flex: 0.7 }]}>{formatFactor(r.factor[k] ?? 0)}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export async function downloadProjectPdf(
  project: Project,
  computation: ProjectComputation,
  library: Library,
) {
  const blob = await pdf(<ProjectPdf project={project} computation={computation} library={library} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `TCD_${sanitiseFilename(project.name)}_${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
