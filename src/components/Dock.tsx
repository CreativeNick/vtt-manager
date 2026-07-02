import type { PanelContext, PanelDef, PanelId } from "../panels/registry";

type DockProps = {
  /** Dockable panels available to this role, in tab order. */
  panels: PanelDef[];
  /** Whether the panel column is expanded (the tab rail is always visible). */
  open: boolean;
  activeTab: PanelId;
  /** Tabs currently popped out into floating windows (shown dimmed in the rail). */
  popped: PanelId[];
  context: PanelContext;
  onSelectTab: (id: PanelId) => void;
  onPopOut: (id: PanelId) => void;
  onToggleOpen: () => void;
};

/// <summary>
/// FoundryVTT-style docked sidebar: a vertical icon rail hugging the right
/// window edge, with the active panel expanding to its left. The rail (and its
/// collapse chevron) stays visible even when the panel is collapsed, so the
/// sidebar can never be lost off-screen.
/// </summary>
export function Dock({
  panels,
  open,
  activeTab,
  popped,
  context,
  onSelectTab,
  onPopOut,
  onToggleOpen,
}: DockProps) {
  const active =
    panels.find((panel) => panel.id === activeTab && !popped.includes(panel.id)) ??
    panels.find((panel) => !popped.includes(panel.id)) ??
    null;

  return (
    <div className="dock">
      <div className="dock-rail">
        {panels.map((panel) => {
          const isPopped = popped.includes(panel.id);
          return (
            <button
              key={panel.id}
              className={`dock-tab${open && active?.id === panel.id ? " dock-tab--active" : ""}${
                isPopped ? " dock-tab--popped" : ""
              }`}
              title={isPopped ? `${panel.label} (popped out)` : panel.label}
              onClick={() => onSelectTab(panel.id)}
            >
              {panel.icon}
            </button>
          );
        })}
        <span className="dock-rail-spacer" />
        <button
          className="dock-tab"
          title={open ? "Collapse" : "Expand"}
          onClick={onToggleOpen}
        >
          {open ? "▶" : "◀"}
        </button>
      </div>

      <div className={`dock-panel${open ? "" : " dock-panel--closed"}`} aria-hidden={!open}>
        <div className="dock-panel-inner">
          {active ? (
            <>
              <div className="dock-panel-head">
                <span className="window-title">{active.title(context)}</span>
                <button
                  className="btn-ghost icon-btn"
                  title="Pop out into a window"
                  onClick={() => onPopOut(active.id)}
                >
                  ⇱
                </button>
              </div>
              <div className="dock-panel-body">{active.render(context)}</div>
            </>
          ) : (
            <div className="dock-panel-body">
              <span className="muted" style={{ padding: "0.5rem" }}>
                All tabs are popped out.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
