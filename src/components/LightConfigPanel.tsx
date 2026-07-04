import type { Light, LightAnimation } from "../lib/types";

/// <summary>
/// Phase 6.6 DM editor for a single light, opened by double-clicking its marker. Edits
/// radius (bright/dim), color + intensity, emission angle + rotation, gradual falloff, and
/// animation. Every change emits the whole light via `onChange` (→ UPDATE_LIGHT); the
/// server re-sanitises, so out-of-range values are clamped centrally.
/// </summary>
export function LightConfigPanel({
  light,
  onChange,
  onDelete,
  onClose,
}: {
  light: Light;
  onChange: (light: Light) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const patch = (fields: Partial<Light>) => onChange({ ...light, ...fields });
  const angle = light.angle ?? 360;
  const anim: LightAnimation = light.animation ?? { type: "none", speed: 1, intensity: 0.5 };
  const patchAnim = (fields: Partial<LightAnimation>) =>
    patch({ animation: { ...anim, ...fields } });

  return (
    <div className="panel" style={{ width: "min(280px, 92vw)" }}>
      <div className="panel-header">
        <span className="panel-title">💡 Light</span>
        <button className="btn-ghost icon-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="panel-body stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label style={{ margin: 0 }}>Enabled</label>
          <button
            className={light.enabled ? "btn-active" : ""}
            onClick={() => patch({ enabled: !light.enabled })}
          >
            {light.enabled ? "On" : "Off"}
          </button>
        </div>

        <div className="row">
          <div style={{ flex: 1 }}>
            <label>Bright (ft)</label>
            <input
              type="number"
              min={0}
              step={5}
              value={light.brightR}
              onChange={(e) => {
                const brightR = Math.max(0, Number(e.target.value) || 0);
                patch({ brightR, dimR: Math.max(brightR, light.dimR) });
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Dim (ft)</label>
            <input
              type="number"
              min={0}
              step={5}
              value={light.dimR}
              onChange={(e) =>
                patch({ dimR: Math.max(light.brightR, Number(e.target.value) || 0) })
              }
            />
          </div>
        </div>

        <div className="field">
          <label>Color</label>
          <div className="row">
            <input
              type="color"
              value={light.color ?? "#ffd166"}
              onChange={(e) => patch({ color: e.target.value })}
            />
            {light.color ? (
              <button
                className="btn-ghost"
                title="Remove color (neutral white light)"
                onClick={() => patch({ color: undefined, colorIntensity: undefined })}
              >
                Clear
              </button>
            ) : (
              <span className="map-toolbar-hint">Neutral (no tint)</span>
            )}
          </div>
        </div>
        {light.color ? (
          <div className="field">
            <label>Color intensity ({Math.round((light.colorIntensity ?? 0.5) * 100)}%)</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={light.colorIntensity ?? 0.5}
              onChange={(e) => patch({ colorIntensity: Number(e.target.value) })}
            />
          </div>
        ) : null}

        <div className="field">
          <label>Emission angle ({angle === 360 ? "full circle" : `${angle}°`})</label>
          <input
            type="range"
            min={10}
            max={360}
            step={5}
            value={angle}
            onChange={(e) => patch({ angle: Number(e.target.value) })}
          />
        </div>
        {angle < 360 ? (
          <div className="field">
            <label>Rotation ({Math.round(light.rotation ?? 0)}°)</label>
            <input
              type="range"
              min={0}
              max={355}
              step={5}
              value={light.rotation ?? 0}
              onChange={(e) => patch({ rotation: Number(e.target.value) })}
            />
          </div>
        ) : null}

        <div className="row" style={{ justifyContent: "space-between" }}>
          <label style={{ margin: 0 }} title="Smooth bright→dim→dark fade vs a hard edge">
            Gradual falloff
          </label>
          <button
            className={light.gradual !== false ? "btn-active" : ""}
            onClick={() => patch({ gradual: light.gradual === false })}
          >
            {light.gradual !== false ? "Smooth" : "Hard edge"}
          </button>
        </div>

        <div className="field">
          <label>Animation</label>
          <select
            value={anim.type}
            onChange={(e) => patchAnim({ type: e.target.value as LightAnimation["type"] })}
          >
            <option value="none">None</option>
            <option value="flicker">Flicker (torch)</option>
            <option value="pulse">Pulse</option>
          </select>
        </div>
        {anim.type !== "none" ? (
          <>
            <div className="field">
              <label>Speed ({(anim.speed ?? 1).toFixed(1)}×)</label>
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={anim.speed ?? 1}
                onChange={(e) => patchAnim({ speed: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Intensity ({Math.round((anim.intensity ?? 0.5) * 100)}%)</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={anim.intensity ?? 0.5}
                onChange={(e) => patchAnim({ intensity: Number(e.target.value) })}
              />
            </div>
          </>
        ) : null}

        <button
          className="btn-danger"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Delete light
        </button>
      </div>
    </div>
  );
}
