import type { Library } from "@/types/library";
import bundle from "@/data/libraries/v2021.Q4-aemo.json";

export const LIBRARY_VERSIONS = ["v2021.Q4-aemo"] as const;
export type LibraryVersion = (typeof LIBRARY_VERSIONS)[number];
export const DEFAULT_LIBRARY_VERSION: LibraryVersion = "v2021.Q4-aemo";

const libraries: Record<LibraryVersion, Library> = {
  "v2021.Q4-aemo": bundle as unknown as Library,
};

async function sha256(text: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = new TextEncoder().encode(text);
    const hash = await globalThis.crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Node fallback (tests)
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Verify the embedded content_hash matches the stringified payload. Returns
 * true when valid. Library bundles are immutable; a mismatch means someone
 * tampered with a published version and we must refuse to use it.
 */
export async function verifyLibraryHash(lib: Library): Promise<boolean> {
  const payload = {
    building_blocks: lib.building_blocks,
    adjustments: lib.adjustments,
    risks: lib.risks,
    indirect_costs: lib.indirect_costs,
  };
  const canonical = JSON.stringify(payload);
  const computed = "sha256:" + (await sha256(canonical));
  return computed === lib.metadata.content_hash;
}

export function getLibrary(version: LibraryVersion = DEFAULT_LIBRARY_VERSION): Library {
  const lib = libraries[version];
  if (!lib) throw new Error(`Unknown library version: ${version}`);
  return lib;
}

export function listLibraries(): LibraryVersion[] {
  return [...LIBRARY_VERSIONS];
}
