import { useMemo, useState } from "react";
import type { BuildingBlock, Library, TopCategory } from "@/types/library";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatAUD } from "@/lib/utils";

export function BuildingBlockPicker({
  open,
  onOpenChange,
  library,
  lockedCategory,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: Library;
  lockedCategory: TopCategory | null;
  onAdd: (block: BuildingBlock, quantity: number) => void;
}) {
  const [cat, setCat] = useState<TopCategory | "">(lockedCategory ?? "");
  const [scat, setScat] = useState<string>("");
  const [kv, setKv] = useState<string>("");
  const [ttl, setTtl] = useState<string>("");
  const [qty, setQty] = useState<string>("1");

  const scats = useMemo(() => {
    if (!cat) return [];
    return Array.from(new Set(library.building_blocks.filter((b) => b.cat === cat).map((b) => b.scat)));
  }, [library, cat]);

  const kvs = useMemo(() => {
    if (!cat || !scat) return [];
    return Array.from(
      new Set(library.building_blocks.filter((b) => b.cat === cat && b.scat === scat).map((b) => b.kv)),
    );
  }, [library, cat, scat]);

  const ttls = useMemo(() => {
    if (!cat || !scat || !kv) return [];
    return Array.from(
      new Set(
        library.building_blocks
          .filter((b) => b.cat === cat && b.scat === scat && b.kv === kv)
          .map((b) => b.ttl),
      ),
    );
  }, [library, cat, scat, kv]);

  const selected: BuildingBlock | undefined = useMemo(() => {
    return library.building_blocks.find((b) => b.cat === cat && b.scat === scat && b.kv === kv && b.ttl === ttl);
  }, [library, cat, scat, kv, ttl]);

  function reset() {
    setCat(lockedCategory ?? "");
    setScat("");
    setKv("");
    setTtl("");
    setQty("1");
  }

  function handleAdd() {
    if (!selected) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n < 0) {
      alert("Quantity must be a non-negative number.");
      return;
    }
    onAdd(selected, n);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }} className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Add building block</DialogTitle>
        <DialogDescription>
          Pick category → subcategory → voltage → detail. Cost figures update live.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <div className="mb-1 font-medium">Category</div>
          <Select
            value={cat}
            disabled={!!lockedCategory}
            onChange={(e) => {
              setCat(e.target.value as TopCategory);
              setScat("");
              setKv("");
              setTtl("");
            }}
          >
            <option value="">Select...</option>
            {(["Station", "Overhead line", "Underground Cable"] as const).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </label>

        <label className="text-sm">
          <div className="mb-1 font-medium">Subcategory</div>
          <Select
            value={scat}
            disabled={!cat}
            onChange={(e) => { setScat(e.target.value); setKv(""); setTtl(""); }}
          >
            <option value="">Select...</option>
            {scats.map((s) => (<option key={s} value={s}>{s}</option>))}
          </Select>
        </label>

        <label className="text-sm">
          <div className="mb-1 font-medium">Voltage (kV)</div>
          <Select
            value={kv}
            disabled={!scat}
            onChange={(e) => { setKv(e.target.value); setTtl(""); }}
          >
            <option value="">Select...</option>
            {kvs.map((k) => (<option key={k} value={k}>{k.trim()}</option>))}
          </Select>
        </label>

        <label className="text-sm">
          <div className="mb-1 font-medium">Detail</div>
          <Select value={ttl} disabled={!kv} onChange={(e) => setTtl(e.target.value)}>
            <option value="">Select...</option>
            {ttls.map((t) => (<option key={t} value={t}>{t}</option>))}
          </Select>
        </label>
      </div>

      {selected && (
        <div className="mt-4 rounded-md border p-4 bg-muted/30">
          <div className="mb-2 text-sm">
            <strong>{selected.ttl}</strong> — per-unit cost{" "}
            <span className="font-mono">{formatAUD(selected.tbbc, 2)}</span> per <em>{selected.un}</em>
          </div>
          {selected.desc && <p className="text-sm whitespace-pre-line mb-2">{selected.desc}</p>}
          {selected.nt && (
            <p className="text-xs whitespace-pre-line text-muted-foreground">{selected.nt}</p>
          )}
          <div className="mt-3 flex items-end gap-3">
            <label className="text-sm">
              <div className="mb-1 font-medium">Quantity ({selected.un})</div>
              <Input
                type="number"
                min={0}
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-32"
              />
            </label>
            <div className="text-sm">
              Line total: <span className="font-mono font-semibold">
                {formatAUD(selected.tbbc * (Number(qty) || 0), 2)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleAdd} disabled={!selected}>Add building block</Button>
      </div>
    </Dialog>
  );
}
