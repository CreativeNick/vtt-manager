import { useEffect, useMemo, useState } from "react";
import { createDefaultSheet, SHEET_SOFT_WARN_BYTES, type CharacterSheet, type SheetRecord } from "../../lib/types";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";
import { uploadPortrait } from "../../lib/uploadAsset";

/**
 * Local editable draft of a sheet, debounced to the server (Phase 7 — extracted from
 * the old CharacterSheet.tsx). Resets only when the shown sheet changes (`record.id`),
 * never on every remote echo, so an in-progress edit isn't clobbered. Exposes a soft
 * size warning below the hard server cap and the portrait-upload flow.
 */
export function useSheetDraft(
  record: SheetRecord | null,
  canEdit: boolean,
  roomId: string,
  onChange: (sheet: CharacterSheet) => void,
) {
  const [draft, setDraft] = useState<CharacterSheet>(record?.data ?? createDefaultSheet(""));
  const [uploading, setUploading] = useState(false);
  const { debounced } = useDebouncedCallback((next: CharacterSheet) => onChange(next), 400);

  useEffect(() => {
    setDraft(record?.data ?? createDefaultSheet(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  const value = canEdit ? draft : (record?.data ?? createDefaultSheet(""));

  const update = (patch: Partial<CharacterSheet>) => {
    if (!canEdit) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    debounced(next);
  };

  const handlePortrait = async (file: File) => {
    if (!canEdit || !record) return;
    setUploading(true);
    try {
      const { url } = await uploadPortrait(roomId, record.id, file);
      update({ iconUrl: url });
    } catch {
      // Non-fatal: portrait stays unchanged.
    } finally {
      setUploading(false);
    }
  };

  // Soft warning as the sheet approaches the hard server-side size cap.
  const overSoftCap = useMemo(() => JSON.stringify(value).length > SHEET_SOFT_WARN_BYTES, [value]);

  return { value, update, uploading, handlePortrait, overSoftCap };
}
