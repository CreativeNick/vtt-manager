import { useState } from "react";

/// <summary>
/// Client-local "reduce visual effects" preference (per browser — NOT synced to the room). When
/// on, the app sheds its expensive decorative paint — tiled paper textures, the 12-layer notch
/// frames, the crystal opal texture + drop-shadows, and the modal backdrop blur — by setting
/// `data-fx="lite"` on the document root, which a scoped CSS block in index.css keys off. A
/// player on a slow machine can turn it on for themselves without affecting the DM or anyone
/// else. Default off = the full look, pixel-identical.
/// </summary>
const KEY = "cm-visual-fx-lite";

export function isVisualEffectsLite(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function applyAttr(lite: boolean): void {
  const root = document.documentElement;
  if (lite) root.setAttribute("data-fx", "lite");
  else root.removeAttribute("data-fx");
}

export function setVisualEffectsLite(lite: boolean): void {
  try {
    localStorage.setItem(KEY, lite ? "1" : "0");
  } catch {
    // Storage unavailable — the attribute still applies for this session.
  }
  applyAttr(lite);
}

/// <summary>Applies the saved preference to the document root; call once at startup, before render.</summary>
export function initVisualEffects(): void {
  applyAttr(isVisualEffectsLite());
}

/// <summary>React state hook backing the Settings toggle.</summary>
export function useVisualEffectsLite(): [boolean, (lite: boolean) => void] {
  const [lite, setLite] = useState(isVisualEffectsLite);
  return [
    lite,
    (value: boolean) => {
      setVisualEffectsLite(value);
      setLite(value);
    },
  ];
}
