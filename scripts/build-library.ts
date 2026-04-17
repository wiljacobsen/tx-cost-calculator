/**
 * Builds a signed, hash-sealed JSON bundle from the CSVs in library/<version>/.
 *
 * Usage:
 *   npx tsx scripts/build-library.ts v2021.Q4-aemo
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

interface CsvRow {
  [key: string]: string;
}

function parseCsv(text: string): CsvRow[] {
  // Minimal RFC4180 parser (handles quoted fields, commas, newlines inside quotes).
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).filter(r => r.length > 1 || (r.length === 1 && r[0] !== "")).map(r => {
    const obj: CsvRow = {};
    header.forEach((h, idx) => { obj[h] = r[idx] ?? ""; });
    return obj;
  });
}

function toNumber(v: string): number {
  if (v === "" || v === undefined) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Non-numeric: ${v}`);
  return n;
}

const DIRECT_KEYS = ["PL", "CS", "EW", "SS", "DS", "TC", "PM", "EP", "EO"] as const;
const INDIRECT_KEYS = ["PD", "WD", "LE", "SCE", "PC", "INS"] as const;

function mapDirect(r: CsvRow): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of DIRECT_KEYS) o[k] = toNumber(r[k]);
  return o;
}
function mapIndirect(r: CsvRow): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of INDIRECT_KEYS) o[k] = toNumber(r[k]);
  return o;
}
function sumDirect(c: Record<string, number>): number {
  return DIRECT_KEYS.reduce((s, k) => s + (c[k] ?? 0), 0);
}
function sumIndirect(c: Record<string, number>): number {
  return INDIRECT_KEYS.reduce((s, k) => s + (c[k] ?? 0), 0);
}

function readCsv<T>(file: string, map: (r: CsvRow) => T): T[] {
  const text = fs.readFileSync(file, "utf-8");
  return parseCsv(text).map(map);
}

function main() {
  const version = process.argv[2] ?? "v2021.Q4-aemo";
  const libDir = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "library", version));
  if (!fs.existsSync(libDir)) throw new Error(`Library directory not found: ${libDir}`);

  const buildingBlocks = readCsv(path.join(libDir, "building_blocks.csv"), (r) => ({
    id: parseInt(r.ID, 10),
    cat: r.CAT as "Station" | "Overhead line" | "Underground Cable",
    scat: r.SCAT,
    ttl: r.TTL,
    desc: r.DESC,
    nt: r.NT,
    kv: r.KV,
    un: r.UN,
    cost: mapDirect(r),
    tbbc: toNumber(r.TBBC),
  }));

  const adjustments = readCsv(path.join(libDir, "adjustments.csv"), (r) => ({
    id: parseInt(r.ID, 10),
    cat: r.CAT,
    scat: r.SCAT,
    ttl: r.TTL,
    desc: r.DESC,
    nt: r.NT,
    factor: mapDirect(r),
  }));

  const risks = readCsv(path.join(libDir, "risks.csv"), (r) => ({
    id: parseInt(r.ID, 10),
    cat: r.CAT,
    scat: r.SCAT,
    ttl: r.TTL,
    desc: r.DESC,
    nt: r.NT,
    factor: mapDirect(r),
  }));

  const indirect = readCsv(path.join(libDir, "indirect_costs.csv"), (r) => ({
    id: parseInt(r.ID, 10),
    cat: r.CAT,
    scat: r.SCAT,
    ttl: r.TTL,
    desc: r.DESC,
    nt: r.NT,
    factor: mapIndirect(r),
    tic: toNumber(r.TIC),
  }));

  // Recompute derived totals (the spec says "recompute, don't trust"). The
  // stakeholder/contract indirect rows store TIC=0 in the source workbook but
  // have non-zero factor sums; the building-block TBBCs are trustworthy but we
  // still normalise to avoid drift.
  const EPS = 1e-6;
  for (const b of buildingBlocks) {
    const computed = sumDirect(b.cost);
    if (Math.abs(computed - b.tbbc) > EPS * Math.max(1, Math.abs(b.tbbc))) {
      throw new Error(
        `Building block ${b.id}: stored TBBC ${b.tbbc} ≠ Σ cost ${computed}`,
      );
    }
    b.tbbc = computed;
  }
  for (const ic of indirect) {
    ic.tic = sumIndirect(ic.factor);
  }

  const metaSrc = JSON.parse(
    fs.readFileSync(path.join(libDir, "metadata.json"), "utf-8"),
  );
  const rowCounts = {
    "building_blocks.csv": buildingBlocks.length,
    "adjustments.csv": adjustments.length,
    "risks.csv": risks.length,
    "indirect_costs.csv": indirect.length,
  };

  const payload = {
    building_blocks: buildingBlocks,
    adjustments,
    risks,
    indirect_costs: indirect,
  };
  const canonical = JSON.stringify(payload);
  const content_hash =
    "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");

  const metadata = {
    library_version: metaSrc.library_version ?? version,
    source_file: metaSrc.source_file,
    currency_year: metaSrc.currency_year,
    currency: metaSrc.currency,
    extracted_at: metaSrc.extracted_at,
    source_description: metaSrc.source_description,
    content_hash,
    row_counts: rowCounts,
  };

  const bundle = { metadata, ...payload };
  const outDir = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "src", "data", "libraries"));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${version}.json`),
    JSON.stringify(bundle, null, 2) + "\n",
    "utf-8",
  );

  // Maintain an index.json
  const indexFile = path.join(outDir, "index.json");
  let index: { version: string; content_hash: string; extracted_at: string }[] = [];
  if (fs.existsSync(indexFile)) {
    try { index = JSON.parse(fs.readFileSync(indexFile, "utf-8")); } catch { index = []; }
  }
  const filtered = index.filter((i) => i.version !== version);
  filtered.push({ version, content_hash, extracted_at: metadata.extracted_at });
  fs.writeFileSync(indexFile, JSON.stringify(filtered, null, 2) + "\n", "utf-8");

  console.log(`Built ${version}`);
  console.log(`  content_hash: ${content_hash}`);
  console.log(`  building_blocks: ${buildingBlocks.length}`);
  console.log(`  adjustments:     ${adjustments.length}`);
  console.log(`  risks:           ${risks.length}`);
  console.log(`  indirect_costs:  ${indirect.length}`);
}

main();
