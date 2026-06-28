import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { JoinParams } from "../hooks/useGameRoom";
import { useCampaignPlayerCounts, useRoomLobby } from "../hooks/useGameRoom";
import {
  loadMergedCampaigns,
  mergeRegistryWithLocal,
  registerCampaignRoom,
} from "../lib/campaignRegistry";
import {
  ensureDefaultCampaigns,
  formatCampaignName,
  generateRoomId,
  type SavedCampaign,
  upsertSavedCampaign,
} from "../lib/savedCampaigns";
import { uploadCampaignIcon } from "../lib/uploadAsset";
import {
  JoinAlertIcon,
  JoinCampaignIcon,
  JoinCheckIcon,
  JoinCloseIcon,
  JoinEnterIcon,
  JoinSearchIcon,
  JoinSpinnerIcon,
} from "./JoinIcons";
import type { Role } from "../lib/types";

type JoinScreenProps = {
  onJoin: (params: JoinParams & { roomId: string }) => void;
};

/// <summary>
/// Renders a campaign list thumbnail or the default scroll icon.
/// </summary>
function CampaignMark({ campaign }: { campaign: SavedCampaign }) {
  if (campaign.iconUrl) {
    return <img src={campaign.iconUrl} alt="" className="join-room-thumb" />;
  }
  return <JoinCampaignIcon className="join-room-icon" size={34} />;
}

/// <summary>
/// Labels a lobby player count for the campaign list.
/// </summary>
function formatLobbyPlayerCount(count: number | null, loading: boolean): string {
  if (loading && count === null) {
    return "…";
  }
  const total = count ?? 0;
  return total === 1 ? "1 player" : `${total} players`;
}

type CreateCampaignModalProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  name: string;
  iconPreview: string | null;
  iconInputRef: RefObject<HTMLInputElement | null>;
  onNameChange: (value: string) => void;
  onIconChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveIcon: () => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
};

/// <summary>
/// Popup form for naming a new campaign and optionally uploading its room icon.
/// </summary>
function CreateCampaignModal({
  open,
  busy,
  error,
  name,
  iconPreview,
  iconInputRef,
  onNameChange,
  onIconChange,
  onRemoveIcon,
  onSubmit,
  onClose,
}: CreateCampaignModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="join-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="join-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-create-campaign-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="join-modal-close"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
        >
          <JoinCloseIcon />
        </button>

        <header className="join-modal-header">
          <p className="join-modal-eyebrow">Campaign room</p>
          <h3 id="join-create-campaign-title">New campaign</h3>
          <p className="join-modal-subtitle">Name your table and optionally add a room icon.</p>
        </header>

        <form className="join-modal-form" onSubmit={onSubmit}>
          <label className="join-modal-field">
            <span className="join-modal-label">Campaign name</span>
            <span className="join-search-field">
              <input
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Wednesday Night Game"
                required
                autoFocus
                disabled={busy}
              />
            </span>
          </label>

          <div className="join-modal-field">
            <span className="join-modal-label">Campaign icon</span>
            <div className="join-modal-icon-card">
              <div className="join-modal-icon-preview" aria-hidden="true">
                {iconPreview ? (
                  <img src={iconPreview} alt="" className="join-modal-icon-image" />
                ) : (
                  <JoinCampaignIcon className="join-room-icon" size={36} />
                )}
              </div>
              <div className="join-modal-icon-actions">
                <button
                  type="button"
                  className="join-modal-secondary-btn"
                  disabled={busy}
                  onClick={() => iconInputRef.current?.click()}
                >
                  {iconPreview ? "Change image" : "Upload image"}
                </button>
                {iconPreview ? (
                  <button
                    type="button"
                    className="join-modal-secondary-btn join-modal-secondary-btn-muted"
                    disabled={busy}
                    onClick={onRemoveIcon}
                  >
                    Remove
                  </button>
                ) : (
                  <p className="join-modal-icon-hint">PNG, JPG, WebP, or GIF</p>
                )}
              </div>
            </div>
            <input
              ref={iconInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="visually-hidden"
              onChange={onIconChange}
            />
          </div>

          {error ? <p className="join-error join-modal-error">{error}</p> : null}

          <footer className="join-modal-footer">
            <button
              type="submit"
              className="join-enter-btn join-modal-submit"
              disabled={busy || !name.trim()}
            >
              {busy ? "Creating…" : "Create campaign"}
              {!busy ? <JoinEnterIcon className="join-enter-icon" /> : null}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/// <summary>
/// Two-column join flow: pick a campaign room on the left, choose role and character on the right.
/// </summary>
export function JoinScreen({ onJoin }: JoinScreenProps) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialRoomId = params.get("room") ?? "campaign1";

  const [campaigns, setCampaigns] = useState<SavedCampaign[]>(() =>
    ensureDefaultCampaigns(initialRoomId),
  );
  const [roomId, setRoomId] = useState(initialRoomId);
  const [campaignName, setCampaignName] = useState(() => formatCampaignName(initialRoomId));
  const [dmName, setDmName] = useState(localStorage.getItem("cm-dm-name") ?? "DM");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(params.get("role") === "dm" ? "dm" : "player");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignIconFile, setNewCampaignIconFile] = useState<File | null>(null);
  const [newCampaignIconPreview, setNewCampaignIconPreview] = useState<string | null>(null);
  const [creatingCampaignBusy, setCreatingCampaignBusy] = useState(false);
  const [createCampaignError, setCreateCampaignError] = useState<string | null>(null);
  const newCampaignIconRef = useRef<HTMLInputElement>(null);
  const newCampaignIconPreviewRef = useRef<string | null>(null);

  const lobby = useRoomLobby(roomId, role === "player");

  const campaignRoomIds = useMemo(() => campaigns.map((campaign) => campaign.roomId), [campaigns]);
  const playerCounts = useCampaignPlayerCounts(campaignRoomIds);

  const filteredCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase();
    if (!query) {
      return campaigns;
    }
    return campaigns.filter(
      (campaign) =>
        campaign.name.toLowerCase().includes(query) ||
        campaign.roomId.toLowerCase().includes(query),
    );
  }, [campaigns, campaignSearch]);

  const activeCampaign =
    campaigns.find((campaign) => campaign.roomId === roomId) ??
    ({
      roomId,
      name: formatCampaignName(roomId),
      lastJoinedAt: 0,
    } satisfies SavedCampaign);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const merged = await loadMergedCampaigns();
        if (!cancelled && merged.length > 0) {
          setCampaigns(merged);
        }
      } catch {
        // Keep the local fallback list when the shared registry is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId);
    url.searchParams.delete("key");
    url.searchParams.set("role", role);
    window.history.replaceState({}, "", url.toString());
  }, [roomId, role]);

  useEffect(() => {
    if (!selectedSlotId) {
      return;
    }
    if (!lobby.availableSlots.some((slot) => slot.id === selectedSlotId)) {
      setSelectedSlotId(null);
    }
  }, [lobby.availableSlots, selectedSlotId]);

  useEffect(() => {
    return () => {
      if (newCampaignIconPreviewRef.current) {
        URL.revokeObjectURL(newCampaignIconPreviewRef.current);
      }
    };
  }, []);

  const resetNewCampaignForm = () => {
    setNewCampaignName("");
    setNewCampaignIconFile(null);
    if (newCampaignIconPreviewRef.current) {
      URL.revokeObjectURL(newCampaignIconPreviewRef.current);
      newCampaignIconPreviewRef.current = null;
    }
    setNewCampaignIconPreview(null);
    setCreateCampaignError(null);
  };

  const handleNewCampaignIconChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (newCampaignIconPreviewRef.current) {
      URL.revokeObjectURL(newCampaignIconPreviewRef.current);
      newCampaignIconPreviewRef.current = null;
    }
    if (!file) {
      setNewCampaignIconFile(null);
      setNewCampaignIconPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    newCampaignIconPreviewRef.current = previewUrl;
    setNewCampaignIconFile(file);
    setNewCampaignIconPreview(previewUrl);
    setCreateCampaignError(null);
  };

  const closeCreateCampaignModal = () => {
    if (creatingCampaignBusy) {
      return;
    }
    setCreateCampaignOpen(false);
    resetNewCampaignForm();
  };

  const handleCreateCampaign = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = newCampaignName.trim();
    if (!trimmedName || creatingCampaignBusy) {
      return;
    }

    const roomIdForCampaign = generateRoomId();
    setCreatingCampaignBusy(true);
    setCreateCampaignError(null);

    try {
      let iconUrl: string | null = null;
      if (newCampaignIconFile) {
        const uploaded = await uploadCampaignIcon(roomIdForCampaign, newCampaignIconFile);
        iconUrl = uploaded.url;
      }

      const registryRooms = await registerCampaignRoom({
        roomId: roomIdForCampaign,
        name: trimmedName,
        iconUrl,
      });
      const local = upsertSavedCampaign(roomIdForCampaign, { name: trimmedName, iconUrl });
      const next = mergeRegistryWithLocal(registryRooms, local);
      setCampaigns(next);
      setRoomId(roomIdForCampaign);
      setCampaignName(trimmedName);
      setSelectedSlotId(null);
      setCreateCampaignOpen(false);
      setCampaignSearch("");
      resetNewCampaignForm();
    } catch (error) {
      setCreateCampaignError(error instanceof Error ? error.message : "Could not create campaign.");
    } finally {
      setCreatingCampaignBusy(false);
    }
  };

  const selectCampaign = (campaign: SavedCampaign) => {
    setRoomId(campaign.roomId);
    setCampaignName(campaign.name);
    setSelectedSlotId(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedRoomId = roomId.trim();
    if (!trimmedRoomId) {
      return;
    }

    const nextCampaigns = upsertSavedCampaign(trimmedRoomId, {
      name: campaignName.trim() || undefined,
    });
    setCampaigns(nextCampaigns);

    if (role === "dm") {
      const displayName = dmName.trim() || "DM";
      localStorage.setItem("cm-dm-name", displayName);
      onJoin({
        roomId: trimmedRoomId,
        role: "dm",
        displayName,
        roomKey: "",
      });
      return;
    }

    if (!selectedSlotId) {
      return;
    }

    onJoin({
      roomId: trimmedRoomId,
      role: "player",
      slotId: selectedSlotId,
      roomKey: "",
    });
  };

  const selectedSlot = lobby.state?.playerSlots.find((slot) => slot.id === selectedSlotId);

  return (
    <div className="join-screen">
      <div className="join-card">
        <header className="join-card-header">
          <p className="join-eyebrow">Virtual tabletop</p>
          <h1>Campaign Manager</h1>
          <p className="subtitle">
            Pick a campaign room, choose your role, and gather the party at the table.
          </p>
        </header>

        <form className="join-card-body" onSubmit={handleSubmit}>
          <div className="join-column join-column-room" aria-labelledby="join-campaigns-heading">
            <div className="join-column-header">
              <h2 id="join-campaigns-heading">Campaign room</h2>
            </div>

            <div className="join-room-panel">
              <label className="join-campaign-search">
                <span className="visually-hidden">Search campaigns</span>
                <span className="join-search-field">
                  <JoinSearchIcon className="join-field-icon" />
                  <input
                    type="search"
                    value={campaignSearch}
                    onChange={(event) => setCampaignSearch(event.target.value)}
                    placeholder="Search by name…"
                    autoComplete="off"
                  />
                </span>
              </label>

              <div className="join-campaign-list" role="listbox" aria-label="Saved campaigns">
                {filteredCampaigns.length === 0 ? (
                  <p className="hint join-campaign-empty">No campaigns match your search.</p>
                ) : (
                  filteredCampaigns.map((campaign) => {
                    const active = campaign.roomId === roomId;
                    const roomActivity = playerCounts[campaign.roomId];
                    const playerCount = roomActivity?.count ?? null;
                    const playerCountLoading = roomActivity?.loading ?? true;
                    return (
                      <button
                        key={campaign.roomId}
                        type="button"
                        className={`join-campaign-select${active ? " active" : ""}`}
                        role="option"
                        aria-selected={active}
                        onClick={() => selectCampaign(campaign)}
                      >
                        <CampaignMark campaign={campaign} />
                        <span className="join-campaign-copy">
                          <span className="join-campaign-name">{campaign.name}</span>
                          <span className="join-campaign-id">{campaign.roomId}</span>
                        </span>
                        <span className="join-campaign-trail">
                          <span
                            className="join-campaign-player-count"
                            aria-label={
                              playerCountLoading && playerCount === null
                                ? "Checking players"
                                : `${playerCount ?? 0} players in room`
                            }
                          >
                            {formatLobbyPlayerCount(playerCount, playerCountLoading)}
                          </span>
                          {active ? <JoinCheckIcon className="join-list-trail-icon" /> : null}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                className="join-campaign-select join-campaign-create"
                onClick={() => setCreateCampaignOpen(true)}
              >
                <JoinCampaignIcon className="join-room-icon" size={34} />
                <span className="join-campaign-copy">
                  <span className="join-campaign-name">New campaign</span>
                  <span className="join-campaign-id">Create a room for your party</span>
                </span>
              </button>
            </div>
          </div>

          <div className="join-column join-column-session" aria-labelledby="join-session-heading">
            <div className="join-column-header">
              <h2 id="join-session-heading">Your session</h2>
            </div>

            <div className="join-session-panel">
              <div className="join-role-grid" role="radiogroup" aria-label="Join as">
                <button
                  type="button"
                  className={`join-role-card${role === "dm" ? " active" : ""}`}
                  onClick={() => setRole("dm")}
                >
                  <span className="join-role-title">Dungeon Master</span>
                  <span className="join-role-copy">Run scenes, fog, tokens, and player access.</span>
                </button>
                <button
                  type="button"
                  className={`join-role-card${role === "player" ? " active" : ""}`}
                  onClick={() => setRole("player")}
                >
                  <span className="join-role-title">Adventurer</span>
                  <span className="join-role-copy">Join a character slot and play from your sheet.</span>
                </button>
              </div>

            {role === "dm" ? (
              <div className="join-session-card">
                <label>
                  Your name
                  <span className="join-search-field">
                    <input
                      value={dmName}
                      onChange={(event) => setDmName(event.target.value)}
                      placeholder="DM"
                    />
                  </span>
                </label>
                <p className="join-panel-note">
                  You will enter as the DM for <strong>{activeCampaign.name}</strong>. Create player
                  slots after joining so your party can pick characters.
                </p>
              </div>
            ) : (
              <div className="join-session-card">
                <h3 className="join-section-title">Choose your character</h3>
                {lobby.status === "connecting" || lobby.status === "idle" ? (
                  <p className="hint join-status-hint">
                    <JoinSpinnerIcon className="join-status-icon join-spinner" />
                    Connecting to {roomId}…
                  </p>
                ) : null}
                {lobby.error ? (
                  <p className="join-error join-status-hint">
                    <JoinAlertIcon className="join-status-icon" />
                    {lobby.error}
                  </p>
                ) : null}
                {lobby.status === "ready" && lobby.state?.playerSlots.length === 0 ? (
                  <p className="join-panel-note">
                    No character slots yet. Ask the DM to create them after joining the room.
                  </p>
                ) : null}
                <div className="slot-list">
                  {lobby.status === "ready" && lobby.state
                    ? lobby.state.playerSlots.map((slot) => {
                        const taken = lobby.state?.connectedPlayers.some(
                          (player) => player.playerId === slot.id,
                        );
                        const selected = selectedSlotId === slot.id;
                        return (
                          <label
                            key={slot.id}
                            className={`slot-option${taken ? " taken" : ""}${selected ? " selected" : ""}`}
                          >
                            <span className="slot-option-body">
                              <span className="slot-name">{slot.name}</span>
                              <span className={`slot-status${taken ? "" : " available"}`}>
                                {taken ? "Taken" : "Available"}
                              </span>
                            </span>
                            <input
                              type="radio"
                              className="slot-radio-input"
                              name="slot"
                              value={slot.id}
                              disabled={taken}
                              checked={selected}
                              onChange={() => setSelectedSlotId(slot.id)}
                            />
                          </label>
                        );
                      })
                    : null}
                </div>
                {selectedSlot ? (
                  <p className="join-selected-slot">
                    Joining as <strong>{selectedSlot.name}</strong>
                  </p>
                ) : null}
              </div>
            )}
            </div>

            <button
              type="submit"
              className="join-enter-btn"
              disabled={role === "player" && (!selectedSlotId || lobby.status !== "ready")}
            >
              Enter {activeCampaign.name}
              <JoinEnterIcon className="join-enter-icon" />
            </button>
          </div>
        </form>
      </div>

      <CreateCampaignModal
        open={createCampaignOpen}
        busy={creatingCampaignBusy}
        error={createCampaignError}
        name={newCampaignName}
        iconPreview={newCampaignIconPreview}
        iconInputRef={newCampaignIconRef}
        onNameChange={setNewCampaignName}
        onIconChange={handleNewCampaignIconChange}
        onRemoveIcon={() => {
          setNewCampaignIconFile(null);
          if (newCampaignIconPreviewRef.current) {
            URL.revokeObjectURL(newCampaignIconPreviewRef.current);
            newCampaignIconPreviewRef.current = null;
          }
          setNewCampaignIconPreview(null);
        }}
        onSubmit={handleCreateCampaign}
        onClose={closeCreateCampaignModal}
      />
    </div>
  );
}
