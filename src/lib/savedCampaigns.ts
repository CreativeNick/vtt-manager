import { clearCampaignAll } from "./campaignStore";

export type SavedCampaign = {
  roomId: string;
  name: string;
  lastJoinedAt: number;
  iconUrl?: string | null;
};

export type UpsertCampaignOptions = {
  name?: string;
  iconUrl?: string | null;
};

const CAMPAIGNS_KEY = "cm-saved-campaigns";
const ROOM_KEYS_KEY = "cm-room-keys";

/// <summary>
/// Loads the user's saved campaign rooms from local storage.
/// </summary>
export function loadSavedCampaigns(): SavedCampaign[] {
  try {
    const raw = localStorage.getItem(CAMPAIGNS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SavedCampaign[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/// <summary>
/// Persists the campaign list to local storage.
/// </summary>
export function saveSavedCampaigns(campaigns: SavedCampaign[]): void {
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
}

/// <summary>
/// Builds a readable default label from a room id slug.
/// </summary>
export function formatCampaignName(roomId: string): string {
  const trimmed = roomId.trim();
  if (!trimmed) {
    return "New campaign";
  }
  return trimmed
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/// <summary>
/// Creates a unique room id for a newly added campaign.
/// </summary>
export function generateRoomId(): string {
  return `campaign-${crypto.randomUUID().slice(0, 8)}`;
}

/// <summary>
/// Adds or updates a campaign entry and moves it to the top of the list.
/// </summary>
export function upsertSavedCampaign(
  roomId: string,
  nameOrOptions?: string | UpsertCampaignOptions,
): SavedCampaign[] {
  const trimmedId = roomId.trim();
  if (!trimmedId) {
    return loadSavedCampaigns();
  }

  const options: UpsertCampaignOptions =
    typeof nameOrOptions === "string" ? { name: nameOrOptions } : (nameOrOptions ?? {});

  const all = loadSavedCampaigns();
  const existing = all.find((item) => item.roomId === trimmedId);
  const campaigns = all.filter((item) => item.roomId !== trimmedId);
  const next: SavedCampaign = {
    roomId: trimmedId,
    name: options.name?.trim() || existing?.name || formatCampaignName(trimmedId),
    lastJoinedAt: Date.now(),
    iconUrl:
      options.iconUrl !== undefined ? options.iconUrl : (existing?.iconUrl ?? null),
  };
  const merged = [next, ...campaigns].sort((a, b) => b.lastJoinedAt - a.lastJoinedAt);
  saveSavedCampaigns(merged);
  return merged;
}

/// <summary>
/// Removes a campaign from the saved list without deleting its room on the server.
/// </summary>
export function removeSavedCampaign(roomId: string): SavedCampaign[] {
  const merged = loadSavedCampaigns().filter((item) => item.roomId !== roomId);
  saveSavedCampaigns(merged);
  // Forget this campaign's per-campaign UI prefs (layout + toggles) so they don't linger.
  clearCampaignAll(roomId);
  return merged;
}

/// <summary>
/// Reads the remembered password for a campaign room, if any.
/// </summary>
export function loadRoomKey(roomId: string): string {
  try {
    const keys = JSON.parse(localStorage.getItem(ROOM_KEYS_KEY) ?? "{}") as Record<string, string>;
    return keys[roomId] ?? "";
  } catch {
    return "";
  }
}

/// <summary>
/// Stores or clears the password for a campaign room in local storage.
/// </summary>
export function saveRoomKey(roomId: string, key: string): void {
  const keys = JSON.parse(localStorage.getItem(ROOM_KEYS_KEY) ?? "{}") as Record<string, string>;
  const trimmed = key.trim();
  if (trimmed) {
    keys[roomId] = trimmed;
  } else {
    delete keys[roomId];
  }
  localStorage.setItem(ROOM_KEYS_KEY, JSON.stringify(keys));
}

/// <summary>
/// Ensures at least one campaign exists for first-time visitors.
/// </summary>
export function ensureDefaultCampaigns(initialRoomId: string): SavedCampaign[] {
  const campaigns = loadSavedCampaigns();
  if (campaigns.length > 0) {
    return campaigns;
  }
  return upsertSavedCampaign(initialRoomId || "campaign1");
}
