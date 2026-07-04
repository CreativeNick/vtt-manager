export type SheetPageId =
  | "main"
  | "inventory"
  | "features"
  | "spells"
  | "effects"
  | "biography"
  | "traits";

export type SheetPageDef = { id: SheetPageId; label: string; icon: string };

/** The right-rail page order. NPCs omit "main" (Features is their home page). */
export const SHEET_PAGES: SheetPageDef[] = [
  { id: "main", label: "Main", icon: "⚙" },
  { id: "inventory", label: "Inventory", icon: "🎒" },
  { id: "features", label: "Features", icon: "☰" },
  { id: "spells", label: "Spells", icon: "📖" },
  { id: "effects", label: "Effects", icon: "⚡" },
  { id: "biography", label: "Biography", icon: "🖋" },
  { id: "traits", label: "Special traits", icon: "★" },
];

/** The right vertical page-switcher rail (same "action rail" idiom as the dock). */
export function SheetRail({
  pages,
  active,
  onSelect,
}: {
  pages: SheetPageDef[];
  active: SheetPageId;
  onSelect: (id: SheetPageId) => void;
}) {
  return (
    <div className="sheet7-rail">
      {pages.map((page) => (
        <button
          type="button"
          key={page.id}
          className={`sheet-rail-btn ${active === page.id ? "sheet-rail-btn--active" : ""}`}
          title={page.label}
          onClick={() => onSelect(page.id)}
        >
          {page.icon}
        </button>
      ))}
    </div>
  );
}
