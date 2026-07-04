import type { MapTool, ToolRuntime } from "./types";

/// <summary>
/// Map pins (Phase 7): a DM-only tool that drops a 📍 note at the click point. Pins are
/// persistent, DM-only annotations (stripped from player frames by redactStateFor), so the
/// DM can mark secrets/reminders on the map that players never see. Click to place (a prompt
/// captures the note text); right-click a pin to remove it.
/// </summary>
export const pinTool: MapTool = {
  id: "pin",
  label: "Map pin",
  icon: "📍",
  hotkey: "p",
  dmOnly: true,
  cursor: "crosshair",
  onDown: (event, rt: ToolRuntime) => {
    const text = (typeof window !== "undefined" ? window.prompt("Pin note (DM-only):", "") : "") ?? "";
    rt.send({
      type: "ADD_ANNOTATION",
      sceneId: rt.scene.id,
      annotation: {
        id: `pin-${crypto.randomUUID().slice(0, 8)}`,
        authorId: rt.yourPlayerId ?? "dm",
        kind: "pin",
        x: event.world.x,
        y: event.world.y,
        text: text.slice(0, 200),
        color: "#e9c176",
        width: 2,
        createdAt: Date.now(),
        ephemeral: false,
        dmOnly: true,
      },
    });
  },
};
