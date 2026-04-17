"""
Extract AEMO TCD reference data from the .xlsb workbook into versioned CSVs.

Usage:
    python3 scripts/extract-from-xlsb.py "Transmission Cost Database 2.0.xlsb"

Emits, into library/v2021.Q4-aemo/:
    building_blocks.csv
    adjustments.csv
    risks.csv
    indirect_costs.csv
    metadata.json
    CHANGELOG.md (only if missing; never overwritten)

The emitted CSVs preserve string values exactly as stored by Excel (including
leading whitespace in the KV column — Excel's pivot matching depends on that).
"""
from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from pyxlsb import open_workbook

LIBRARY_VERSION = "v2021.Q4-aemo"
OUT_DIR = Path(__file__).resolve().parent.parent / "library" / LIBRARY_VERSION

SHEETS = {
    "building_blocks.csv": {
        "sheet": "dataBuildingBlock",
        "columns": ["ID", "CAT", "SCAT", "TTL", "DESC", "NT", "KV", "UN",
                    "PL", "CS", "EW", "SS", "DS", "TC", "PM", "EP", "EO", "TBBC"],
        "numeric": {"ID": int,
                    "PL": float, "CS": float, "EW": float, "SS": float,
                    "DS": float, "TC": float, "PM": float, "EP": float, "EO": float,
                    "TBBC": float},
    },
    "adjustments.csv": {
        "sheet": "dataAdjustment",
        "columns": ["ID", "CAT", "SCAT", "TTL", "DESC", "NT",
                    "PL", "CS", "EW", "SS", "DS", "TC", "PM", "EP", "EO"],
        "numeric": {"ID": int,
                    "PL": float, "CS": float, "EW": float, "SS": float,
                    "DS": float, "TC": float, "PM": float, "EP": float, "EO": float},
    },
    "risks.csv": {
        "sheet": "dataRisk",
        "columns": ["ID", "CAT", "SCAT", "TTL", "DESC", "NT",
                    "PL", "CS", "EW", "SS", "DS", "TC", "PM", "EP", "EO"],
        "numeric": {"ID": int,
                    "PL": float, "CS": float, "EW": float, "SS": float,
                    "DS": float, "TC": float, "PM": float, "EP": float, "EO": float},
    },
    "indirect_costs.csv": {
        "sheet": "dataIndirectCost",
        "columns": ["ID", "CAT", "SCAT", "TTL", "DESC", "NT",
                    "PD", "WD", "LE", "SCE", "PC", "INS", "TIC"],
        "numeric": {"ID": int,
                    "PD": float, "WD": float, "LE": float, "SCE": float,
                    "PC": float, "INS": float, "TIC": float},
    },
}


def cell_value(cell, kind):
    v = cell.v
    if v is None:
        if kind is int:
            return 0
        if kind is float:
            return 0.0
        return ""
    if kind is int:
        return int(v)
    if kind is float:
        return float(v)
    return str(v)


def extract_sheet(wb, spec):
    expected_cols = spec["columns"]
    numeric = spec["numeric"]
    with wb.get_sheet(spec["sheet"]) as s:
        rows = list(s.rows())
    header = [str(c.v).strip() if c.v is not None else "" for c in rows[0]]
    # Header sanity: first len(expected_cols) names must match
    for i, name in enumerate(expected_cols):
        if i >= len(header) or header[i] != name:
            raise RuntimeError(
                f"Sheet {spec['sheet']}: column {i} expected {name!r}, got {header[i]!r}")
    out = []
    for r in rows[1:]:
        if all(c.v in (None, "") for c in r[:len(expected_cols)]):
            continue
        row = {}
        for i, name in enumerate(expected_cols):
            kind = numeric.get(name, str)
            row[name] = cell_value(r[i] if i < len(r) else None, kind) if i < len(r) else (
                0 if kind is int else (0.0 if kind is float else ""))
        out.append(row)
    return out


def write_csv(path: Path, columns, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def main(xlsb_path: str):
    src = Path(xlsb_path)
    if not src.exists():
        print(f"Source not found: {src}", file=sys.stderr)
        sys.exit(1)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with open_workbook(str(src)) as wb:
        counts = {}
        for fname, spec in SHEETS.items():
            rows = extract_sheet(wb, spec)
            write_csv(OUT_DIR / fname, spec["columns"], rows)
            counts[fname] = len(rows)
            print(f"  {fname}: {len(rows)} rows")

    metadata = {
        "library_version": LIBRARY_VERSION,
        "source_file": src.name,
        "currency_year": 2021,
        "currency": "AUD",
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "row_counts": counts,
        "source_description": (
            "AEMO Transmission Cost Database 2.0 — Cost data release 4-0 "
            "dated 44995 (2023-03-04); tool version 15-10-2021."
        ),
    }
    (OUT_DIR / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    changelog = OUT_DIR / "CHANGELOG.md"
    if not changelog.exists():
        changelog.write_text(
            "# CHANGELOG — v2021.Q4-aemo\n\n"
            "## Initial extraction\n"
            "- Extracted from AEMO's `Transmission Cost Database 2.0.xlsb`\n"
            "- 1,875 building blocks; 128 adjustments; 147 risks; 23 indirect cost rows\n",
            encoding="utf-8",
        )
    print(f"\nWrote library version {LIBRARY_VERSION} to {OUT_DIR}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1])
