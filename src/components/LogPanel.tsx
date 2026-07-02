import { useState } from "react";
import { formatDiceRoll } from "../lib/dice";
import type { LogEntry, PlayerSlot } from "../lib/types";

type LogPanelProps = {
  log: LogEntry[];
  isDm: boolean;
  yourPlayerId: string | null;
  playerSlots: PlayerSlot[];
  onSendChat: (text: string, whisperTo?: string) => void;
};

type LogFilter = "all" | "rolls" | "chat";

/// <summary>
/// Resolves a whisper target from `/w name message`: "dm" or a slot-name prefix
/// (case-insensitive). Returns null when no target matches.
/// </summary>
function resolveWhisperTarget(name: string, slots: PlayerSlot[]): string | null {
  const query = name.toLowerCase();
  if (query === "dm") {
    return "dm";
  }
  const slot = slots.find((item) => item.name.toLowerCase().startsWith(query));
  return slot ? slot.id : null;
}

/// <summary>
/// The unified roll/action/chat feed with a chat input. Whispers use
/// `/w name message`; what each viewer sees is already filtered server-side.
/// </summary>
export function LogPanel({ log, isDm, yourPlayerId, playerSlots, onSendChat }: LogPanelProps) {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [text, setText] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  const slotName = (id: string) =>
    id === "dm" ? "DM" : (playerSlots.find((slot) => slot.id === id)?.name ?? "player");

  const visible = log.filter((entry) => {
    if (filter === "rolls") return entry.kind === "roll";
    if (filter === "chat") return entry.kind === "chat";
    return true;
  });

  const submit = () => {
    const raw = text.trim();
    if (!raw) {
      return;
    }
    const whisperMatch = raw.match(/^\/w(?:hisper)?\s+(\S+)\s+([\s\S]+)$/i);
    if (whisperMatch) {
      const target = resolveWhisperTarget(whisperMatch[1], playerSlots);
      if (!target) {
        setInputError(`No player named “${whisperMatch[1]}”. Try /w dm or a character name.`);
        return;
      }
      onSendChat(whisperMatch[2].trim(), target);
    } else if (raw.startsWith("/")) {
      setInputError("Unknown command. Whisper with: /w name message");
      return;
    } else {
      onSendChat(raw);
    }
    setText("");
    setInputError(null);
  };

  return (
    <div className="panel-body stack log-panel">
      <div className="row">
        {(["all", "rolls", "chat"] as const).map((id) => (
          <button
            key={id}
            className={`chip-btn ${filter === id ? "btn-active" : ""}`}
            onClick={() => setFilter(id)}
          >
            {id === "all" ? "All" : id === "rolls" ? "Rolls" : "Chat"}
          </button>
        ))}
      </div>

      <div className="log-feed">
        {visible.length === 0 ? <span className="muted">Nothing here yet.</span> : null}
        {[...visible].reverse().map((entry) => {
          if (entry.kind === "event") {
            return (
              <div className="log-event" key={entry.id}>
                {entry.dmOnly ? "🔒 " : ""}
                {entry.text}
              </div>
            );
          }
          if (entry.kind === "chat") {
            const whisper = entry.whisperTo
              ? ` (whisper to ${slotName(entry.whisperTo)})`
              : "";
            return (
              <div className={`log-chat${entry.whisperTo ? " log-whisper" : ""}`} key={entry.id}>
                <b>{entry.fromId === yourPlayerId ? "You" : entry.from}</b>
                <span className="muted">{whisper}</span>: {entry.text}
              </div>
            );
          }
          if (entry.masked) {
            return (
              <div className="roll roll--masked" key={entry.id}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="who">🔒 {entry.actor.name}</span>
                  <span className="total">?</span>
                </div>
                <span className="expr">rolled in secret</span>
              </div>
            );
          }
          return (
            <div className="roll" key={entry.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="who">
                  {entry.dmOnly ? "🔒 " : ""}
                  {entry.actor.name}
                  {entry.label ? <span className="muted"> — {entry.label}</span> : null}
                </span>
                <span className="total">{entry.roll.total}</span>
              </div>
              <span className="expr">{formatDiceRoll(entry.roll)}</span>
            </div>
          );
        })}
      </div>

      <div className="stack" style={{ gap: "0.25rem" }}>
        <div className="row">
          <input
            value={text}
            placeholder={isDm ? "Message… (/w name to whisper)" : "Message… (/w dm to whisper)"}
            onChange={(e) => {
              setText(e.target.value);
              setInputError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            aria-label="Chat message"
          />
          <button className="btn-primary" onClick={submit}>
            Send
          </button>
        </div>
        {inputError ? <span className="input-error">{inputError}</span> : null}
      </div>
    </div>
  );
}
