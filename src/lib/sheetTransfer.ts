import {
  MAX_SHEET_BYTES,
  normalizeCharacterSheet,
  normalizeItem,
  type CharacterSheet,
  type ItemRecord,
} from "./types";

/// <summary>
/// Export/import of a single character/NPC sheet or catalog item as a JSON file.
/// Export is pure client-side (the viewer already holds the data); import parses the
/// file, verifies the envelope, and runs the SAME sanitizers the server applies
/// (normalizeCharacterSheet / normalizeItem), so a hand-edited or hostile file can
/// never put malformed data on the wire. Like the campaign backup, images travel as
/// URL references, never embedded — a portrait resolves on the same deployment and
/// falls back to the initial glyph elsewhere.
/// </summary>

const SHEET_KIND = "campaign-manager-sheet";
const ITEM_KIND = "campaign-manager-item";
const VERSION = 1;

export type SheetExportFile = { kind: typeof SHEET_KIND; version: number; sheet: CharacterSheet };
export type ItemExportFile = { kind: typeof ITEM_KIND; version: number; item: ItemRecord };

/** Triggers a browser download of `payload` as pretty-printed JSON. */
export function downloadJson(filename: string, payload: unknown): void {
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Non-fatal: the download just doesn't start.
  }
}

/** A filesystem-safe filename from an entity name (fallback when blank). */
export function transferFilename(name: string, suffix: string): string {
  const safe = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  return `${safe || "unnamed"}.${suffix}.json`;
}

export function sheetExportPayload(sheet: CharacterSheet): SheetExportFile {
  return { kind: SHEET_KIND, version: VERSION, sheet };
}

export function itemExportPayload(item: ItemRecord): ItemExportFile {
  return { kind: ITEM_KIND, version: VERSION, item };
}

function parseEnvelope(text: string, expectedKind: string, noun: string): Record<string, unknown> {
  if (text.length > MAX_SHEET_BYTES * 4) {
    throw new Error(`That file is too large to be a ${noun} export.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || (parsed as { kind?: unknown }).kind !== expectedKind) {
    throw new Error(`That file isn't a ${noun} export from this app.`);
  }
  const envelope = parsed as Record<string, unknown>;
  if (typeof envelope.version !== "number" || envelope.version > VERSION) {
    throw new Error(`That ${noun} export is from a newer version of the app.`);
  }
  return envelope;
}

/** Parses + sanitizes an exported sheet file. Throws with a user-readable message. */
export function parseSheetImport(text: string): CharacterSheet {
  const envelope = parseEnvelope(text, SHEET_KIND, "character sheet");
  if (typeof envelope.sheet !== "object" || envelope.sheet === null) {
    throw new Error("That file has no sheet data in it.");
  }
  const sheet = normalizeCharacterSheet(envelope.sheet as Partial<CharacterSheet>, "");
  if (JSON.stringify(sheet).length > MAX_SHEET_BYTES) {
    throw new Error("That sheet is too large to import (over the save limit).");
  }
  return sheet;
}

/** Parses + sanitizes an exported item file; the caller supplies the target item's id. */
export function parseItemImport(text: string, targetId: string): ItemRecord {
  const envelope = parseEnvelope(text, ITEM_KIND, "item");
  if (typeof envelope.item !== "object" || envelope.item === null) {
    throw new Error("That file has no item data in it.");
  }
  return normalizeItem({ ...(envelope.item as Partial<ItemRecord>), id: targetId });
}
