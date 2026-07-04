import type { GameState } from "./types";

/** One place a stored asset URL is referenced in the campaign. */
export type AssetUsage = { kind: "token" | "sheet" | "scene" | "item"; id: string; label: string };

/**
 * Finds everywhere a stored-asset URL is used across the campaign (Phase 7 Assets page):
 * token images, sheet portraits, scene maps, and item icons. Pure — the DM's "in use by N
 * places" delete warning scans this so an in-use image isn't dropped by accident.
 */
export function findAssetUsage(state: GameState, url: string): AssetUsage[] {
  const usage: AssetUsage[] = [];
  for (const token of state.tokens) {
    if (token.imageUrl === url) {
      usage.push({ kind: "token", id: token.id, label: token.label || "Token" });
    }
  }
  for (const record of Object.values(state.sheets)) {
    if (record.data.iconUrl === url) {
      usage.push({ kind: "sheet", id: record.id, label: record.data.characterName || "Sheet" });
    }
  }
  for (const scene of state.scenes) {
    if (scene.mapUrl === url) {
      usage.push({ kind: "scene", id: scene.id, label: scene.name || "Scene" });
    }
  }
  for (const item of Object.values(state.items)) {
    if (item.iconUrl === url) {
      usage.push({ kind: "item", id: item.id, label: item.name || "Item" });
    }
  }
  return usage;
}
