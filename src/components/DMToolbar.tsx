import { useRef, useState } from "react";
import type { GameState } from "../lib/types";
import type { useDmActions } from "../hooks/useGameRoom";
import type { FogBrushMode } from "../lib/fogCanvas";
import { AddTokenPopover } from "./AddTokenPopover";

type DmToolbarProps = {
  state: GameState;
  dm: ReturnType<typeof useDmActions>;
  mode: "main" | "play";
  fogMode: boolean;
  onFogModeChange: (enabled: boolean) => void;
  fogPreview: boolean;
  onFogPreviewChange: (enabled: boolean) => void;
  fogBrushMode: FogBrushMode;
  onFogBrushModeChange: (mode: FogBrushMode) => void;
};

/// <summary>
/// DM toolbar with scene switching; token and fog controls in main (play) mode.
/// </summary>
export function DMToolbar({
  state,
  dm,
  mode,
  fogMode,
  onFogModeChange,
  fogPreview,
  onFogPreviewChange,
  fogBrushMode,
  onFogBrushModeChange,
}: DmToolbarProps) {
  const [tokenPopoverOpen, setTokenPopoverOpen] = useState(false);
  const tokenAnchorRef = useRef<HTMLDivElement>(null);
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  const sceneTokens = state.tokens.filter((token) => token.sceneId === state.activeSceneId);
  const fogAvailable = activeScene?.fogEnabled ?? false;

  return (
    <footer className="dm-toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">Scenes</span>
        {state.scenes.map((scene) => (
          <button
            key={scene.id}
            type="button"
            className={scene.id === state.activeSceneId ? "active" : ""}
            onClick={() => dm.setScene(scene.id)}
          >
            {scene.name}
          </button>
        ))}
      </div>

      {mode === "play" ? (
        <>
          <div className="toolbar-group">
            <span className="toolbar-label">Play</span>
            <div className="token-add-anchor" ref={tokenAnchorRef}>
              <button
                type="button"
                className={tokenPopoverOpen ? "active" : ""}
                onClick={() => setTokenPopoverOpen((open) => !open)}
              >
                + Token
              </button>
              {tokenPopoverOpen ? (
                <AddTokenPopover
                  state={state}
                  dm={dm}
                  anchorRef={tokenAnchorRef}
                  onClose={() => setTokenPopoverOpen(false)}
                />
              ) : null}
            </div>
            {fogAvailable ? (
              <>
                <button
                  type="button"
                  className={fogMode ? "active" : ""}
                  onClick={() => onFogModeChange(!fogMode)}
                >
                  Fog brush
                </button>
                {fogMode ? (
                  <>
                    <button
                      type="button"
                      className={fogBrushMode === "reveal" ? "active" : ""}
                      onClick={() => onFogBrushModeChange("reveal")}
                    >
                      Reveal
                    </button>
                    <button
                      type="button"
                      className={fogBrushMode === "hide" ? "active" : ""}
                      onClick={() => onFogBrushModeChange("hide")}
                    >
                      Hide
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className={fogPreview ? "active" : ""}
                  onClick={() => onFogPreviewChange(!fogPreview)}
                  title="Off = x-ray vision (see through fog)"
                >
                  Preview fog
                </button>
              </>
            ) : null}
          </div>

          {sceneTokens.length > 0 ? (
            <div className="toolbar-group">
              <span className="toolbar-label">Tokens</span>
              {sceneTokens.map((token) => (
                <button
                  key={token.id}
                  type="button"
                  className="btn-compact danger"
                  onClick={() => dm.removeToken(token.id)}
                >
                  × {token.label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </footer>
  );
}
