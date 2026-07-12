/// <summary>
/// Per-campaign UI prefs in localStorage, namespaced by roomId (key shape `cm:{roomId}:{name}`).
/// Extends the global `localFlags` idiom so each campaign remembers its own layout + device
/// toggles independently. When a per-campaign value is absent it falls back to the legacy GLOBAL
/// key, so a user's existing prefs carry into their first per-campaign load instead of resetting.
/// Purely client-side — never touches the server or R2.
/// </summary>

/** The namespaced localStorage key for a campaign pref. */
export function campaignKey(roomId: string, name: string): string {
  return `cm:${roomId}:${name}`;
}

export function readCampaignFlag(
  roomId: string,
  name: string,
  fallback: boolean,
  legacyKey?: string,
): boolean {
  try {
    const raw = localStorage.getItem(campaignKey(roomId, name));
    if (raw !== null) {
      return raw === "1";
    }
    if (legacyKey) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy !== null) {
        return legacy === "1";
      }
    }
  } catch {
    // storage unavailable — use the fallback
  }
  return fallback;
}

export function writeCampaignFlag(roomId: string, name: string, on: boolean) {
  try {
    localStorage.setItem(campaignKey(roomId, name), on ? "1" : "0");
  } catch {
    // preference just won't persist
  }
}

/** Reads a JSON pref, shallow-merged over `fallback`; falls back to a legacy global key once. */
export function readCampaignJson<T extends object>(
  roomId: string,
  name: string,
  fallback: T,
  legacyKey?: string,
): T {
  try {
    const raw =
      localStorage.getItem(campaignKey(roomId, name)) ??
      (legacyKey ? localStorage.getItem(legacyKey) : null);
    if (raw !== null) {
      return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
    }
  } catch {
    // corrupt/unavailable — use the fallback
  }
  return fallback;
}

export function writeCampaignJson<T>(roomId: string, name: string, value: T) {
  try {
    localStorage.setItem(campaignKey(roomId, name), JSON.stringify(value));
  } catch {
    // preference just won't persist
  }
}

/** Removes keys under a campaign's prefix that match `pred` (name = key minus the prefix). */
function removeWhere(roomId: string, pred: (name: string) => boolean) {
  try {
    const prefix = campaignKey(roomId, "");
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && pred(key.slice(prefix.length))) {
        doomed.push(key);
      }
    }
    for (const key of doomed) {
      localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
}

/** Clears a campaign's LAYOUT keys (window geometry, tray, layout blob); keeps device toggles. */
export function clearCampaignLayout(roomId: string) {
  removeWhere(roomId, (name) => name === "layout" || name === "tray" || name.startsWith("win:"));
}

/** Removes ALL of a campaign's keys (layout + toggles) — used when a campaign is deleted. */
export function clearCampaignAll(roomId: string) {
  removeWhere(roomId, () => true);
}
