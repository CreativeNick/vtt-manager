import { useState } from "react";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";

type NotesPanelProps = {
  /** Current DM notes from state (server truth at mount time). */
  notes: string;
  onChange: (notes: string) => void;
};

/// <summary>
/// DM-only scratchpad. The text lives in GameState.dmNotes (persisted with the
/// room, redacted to "" for players) and saves with a debounce while typing.
/// </summary>
export function NotesPanel({ notes, onChange }: NotesPanelProps) {
  // Local draft seeded once at mount — there is a single DM, so no concurrent editor.
  const [draft, setDraft] = useState(notes);
  const { debounced } = useDebouncedCallback((next: string) => onChange(next), 500);

  return (
    <div className="panel-body stack">
      <textarea
        className="notes-area"
        value={draft}
        placeholder="Session prep, secrets, reminders — players never receive this text."
        onChange={(e) => {
          setDraft(e.target.value);
          debounced(e.target.value);
        }}
      />
    </div>
  );
}
