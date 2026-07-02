import { useRef, useState, type ReactNode } from "react";
import { startPointerDrag, wasRecentDrag, type PointerDrop } from "../lib/pointerDrag";
import type { Folder } from "../lib/types";

export type DirectoryRowData = {
  id: string;
  name: string;
  iconUrl?: string | null;
  /** Fallback avatar color when there is no icon. */
  color?: string;
  /** Small tag rendered after the name (e.g. "PC"). */
  badge?: string;
  folderId: string | null;
  /** Manual sort position within its folder (unset sorts last). */
  order?: number;
};

type DirectoryProps = {
  kind: Folder["kind"];
  folders: Folder[];
  /** Pre-sorted rows (panels sort by order, then name). */
  rows: DirectoryRowData[];
  createLabel: string;
  onCreate: (name: string) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  /** Row dropped into a folder (or root) and/or reordered. */
  onMoveRow: (rowId: string, folderId: string | null, sortOrder: number) => void;
  /** Row dropped outside the directory (the map, a sheet, …). */
  onExternalDrop?: (rowId: string, element: Element | null, clientX: number, clientY: number) => void;
  onRowClick?: (rowId: string) => void;
  renderRowActions?: (rowId: string) => ReactNode;
  /** Inline expansion under a row (e.g. the item editor). */
  renderExpanded?: (rowId: string) => ReactNode;
  footer?: ReactNode;
};

/// <summary>
/// Monotone display positions for a group of rows: explicit orders are
/// respected, unset ones continue after the previous row. Insertion midpoints
/// computed against these stay consistent even for never-ordered rows.
/// </summary>
function effectiveOrders(rows: DirectoryRowData[]): Map<string, number> {
  const map = new Map<string, number>();
  let prev = 0;
  for (const row of rows) {
    const eff =
      typeof row.order === "number" ? Math.max(row.order, prev + 1e-9) : prev + 1024;
    map.set(row.id, eff);
    prev = eff;
  }
  return map;
}

/// <summary>
/// FoundryVTT-style directory: search, collapsible folders, quick create, and
/// pointer-based drag-and-drop — drag rows onto folders/root to organize, onto
/// other rows to reorder, or out of the panel entirely (map, sheets).
/// </summary>
export function Directory({
  kind,
  folders,
  rows,
  createLabel,
  onCreate,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveRow,
  onExternalDrop,
  onRowClick,
  renderRowActions,
  renderExpanded,
  footer,
}: DirectoryProps) {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<Element | null>(null);

  const setDragging = (on: boolean) =>
    containerRef.current?.classList.toggle("dir--dragging", on);

  const setHover = (element: Element | null) => {
    const container = containerRef.current;
    const candidate = element?.closest("[data-dir-drop], [data-dir-row]") ?? null;
    const valid = candidate && container?.contains(candidate) ? candidate : null;
    if (hoverRef.current !== valid) {
      hoverRef.current?.classList.remove("drop-hover");
      valid?.classList.add("drop-hover");
      hoverRef.current = valid;
    }
  };

  const groupRows = (folderId: string | null) =>
    rows.filter((row) => row.folderId === folderId);

  /** Resolve a pointer-drag release into a folder move, a reorder, or an external drop. */
  const handleRowDrop = (rowId: string, drop: PointerDrop) => {
    const container = containerRef.current;
    const el = drop.element;

    const folderTarget = el?.closest("[data-dir-drop]");
    if (folderTarget && container?.contains(folderTarget)) {
      const value = folderTarget.getAttribute("data-dir-drop")!;
      const folderId = value === "root" ? null : value;
      const group = groupRows(folderId).filter((row) => row.id !== rowId);
      const effs = effectiveOrders(group);
      const last = group.length > 0 ? effs.get(group[group.length - 1].id)! : 0;
      onMoveRow(rowId, folderId, last + 1024);
      return;
    }

    const rowTarget = el?.closest("[data-dir-row]");
    if (rowTarget && container?.contains(rowTarget)) {
      const targetId = rowTarget.getAttribute("data-dir-row")!;
      const target = rows.find((row) => row.id === targetId);
      if (!target || targetId === rowId) {
        return;
      }
      const group = groupRows(target.folderId).filter((row) => row.id !== rowId);
      const effs = effectiveOrders(group);
      const rect = rowTarget.getBoundingClientRect();
      const before = drop.clientY < rect.top + rect.height / 2;
      const targetIndex = group.findIndex((row) => row.id === targetId);
      const insertAt = before ? targetIndex : targetIndex + 1;
      const prev = insertAt > 0 ? effs.get(group[insertAt - 1].id)! : null;
      const next = insertAt < group.length ? effs.get(group[insertAt].id)! : null;
      const sortOrder =
        prev !== null && next !== null
          ? (prev + next) / 2
          : prev !== null
            ? prev + 1024
            : next !== null
              ? next - 1024
              : 1024;
      onMoveRow(rowId, target.folderId, sortOrder);
      return;
    }

    onExternalDrop?.(rowId, el, drop.clientX, drop.clientY);
  };

  const query = search.trim().toLowerCase();
  const matches = (row: DirectoryRowData) => row.name.toLowerCase().includes(query);

  const toggleFolder = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const create = () => {
    // Empty is allowed: the panel fills in a numbered default (e.g. "NPC 3").
    onCreate(newName.trim());
    setNewName("");
  };

  const createFolder = () => {
    onCreateFolder(newName.trim());
    setNewName("");
  };

  const renderRow = (row: DirectoryRowData) => (
    <div key={row.id}>
      <div
        className="dir-row"
        data-dir-row={row.id}
        onPointerDown={(event) => {
          if ((event.target as Element).closest("button, input, textarea, select")) {
            return;
          }
          startPointerDrag(event, {
            label: row.name,
            onStart: () => setDragging(true),
            onHover: setHover,
            onDrop: (drop) => handleRowDrop(row.id, drop),
            onEnd: () => setDragging(false),
          });
        }}
        onClick={() => {
          if (!wasRecentDrag()) {
            onRowClick?.(row.id);
          }
        }}
      >
        {row.iconUrl ? (
          <img className="dir-icon" src={row.iconUrl} alt="" draggable={false} />
        ) : (
          <span className="dir-icon dir-dot" style={{ background: row.color ?? "var(--surface-2)" }} />
        )}
        <span className="dir-name">{row.name}</span>
        {row.badge ? <span className="dir-badge">{row.badge}</span> : null}
        <span className="dir-actions" onClick={(event) => event.stopPropagation()}>
          {renderRowActions?.(row.id)}
        </span>
      </div>
      {renderExpanded?.(row.id)}
    </div>
  );

  // While searching, show a flat filtered list (folders ignored).
  if (query) {
    const found = rows.filter(matches);
    return (
      <div className="panel-body stack dir" ref={containerRef}>
        <input
          value={search}
          placeholder="Search…"
          onChange={(e) => setSearch(e.target.value)}
        />
        {found.length === 0 ? <span className="muted">No matches.</span> : found.map(renderRow)}
      </div>
    );
  }

  const rootRows = rows.filter((row) => row.folderId === null);

  return (
    <div className="panel-body stack dir" ref={containerRef}>
      <div className="row">
        <input
          value={newName}
          placeholder={`New ${kind} or folder name…`}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
        />
        <button className="btn-primary" title={createLabel} onClick={create}>
          ＋
        </button>
        <button title="Create folder" onClick={createFolder}>
          📁+
        </button>
      </div>
      <input value={search} placeholder="Search…" onChange={(e) => setSearch(e.target.value)} />

      {folders.length > 0 ? (
        <div className="dir-root-drop" data-dir-drop="root">
          ⤒ Root — drop here to move out of a folder
        </div>
      ) : null}

      {folders.map((folder) => {
        const memberRows = rows.filter((row) => row.folderId === folder.id);
        const isCollapsed = collapsed.has(folder.id);
        return (
          <div key={folder.id}>
            <div className="dir-folder" data-dir-drop={folder.id}>
              <button
                className="dir-folder-toggle"
                title={isCollapsed ? "Expand" : "Collapse"}
                onClick={() => toggleFolder(folder.id)}
              >
                {isCollapsed ? "▸" : "▾"} 📁
              </button>
              <input
                className="dir-folder-name"
                key={folder.id + folder.name}
                defaultValue={folder.name}
                title="Folder name (edit to rename)"
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== folder.name) {
                    onRenameFolder(folder.id, name);
                  }
                }}
              />
              <span className="muted">{memberRows.length}</span>
              <button
                className="btn-ghost icon-btn"
                title="Delete folder (contents move to root)"
                onClick={() => onDeleteFolder(folder.id)}
              >
                ✕
              </button>
            </div>
            {isCollapsed ? null : <div className="dir-folder-body">{memberRows.map(renderRow)}</div>}
          </div>
        );
      })}

      {rootRows.map(renderRow)}
      {rows.length === 0 ? <span className="muted">Nothing here yet.</span> : null}
      {footer}
    </div>
  );
}
