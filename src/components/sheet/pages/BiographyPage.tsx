import { Field } from "../atoms";
import type { SheetEdit } from "../context";

/** A labeled multiline text block. */
function TextBlock({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="bio-block">
      <label>{label}</label>
      <textarea value={value} disabled={disabled} rows={3} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * The Biography page: a details grid (alignment/faith/gender/eyes/hair/skin/height/
 * weight/age), ideals/bonds/flaws + personality/appearance, and the full biography text.
 */
export function BiographyPage({ sheet }: { sheet: SheetEdit }) {
  const { value, canEdit, update } = sheet;
  return (
    <div className="sheet-page bio-page">
      <div className="bio-details sheet-section">
        <Field label="Alignment" value={value.alignment} disabled={!canEdit} onChange={(alignment) => update({ alignment })} />
        <Field label="Faith" value={value.faith} disabled={!canEdit} onChange={(faith) => update({ faith })} />
        <Field label="Gender" value={value.gender} disabled={!canEdit} onChange={(gender) => update({ gender })} />
        <Field label="Eyes" value={value.eyes} disabled={!canEdit} onChange={(eyes) => update({ eyes })} />
        <Field label="Hair" value={value.hair} disabled={!canEdit} onChange={(hair) => update({ hair })} />
        <Field label="Skin" value={value.skin} disabled={!canEdit} onChange={(skin) => update({ skin })} />
        <Field label="Height" value={value.height} disabled={!canEdit} onChange={(height) => update({ height })} />
        <Field label="Weight" value={value.weight} disabled={!canEdit} onChange={(weight) => update({ weight })} />
        <Field label="Age" value={value.age} disabled={!canEdit} onChange={(age) => update({ age })} />
      </div>

      <div className="bio-columns">
        <div className="bio-col sheet-section">
          <TextBlock label="Ideals" value={value.ideals} disabled={!canEdit} onChange={(ideals) => update({ ideals })} />
          <TextBlock label="Bonds" value={value.bonds} disabled={!canEdit} onChange={(bonds) => update({ bonds })} />
          <TextBlock label="Flaws" value={value.flaws} disabled={!canEdit} onChange={(flaws) => update({ flaws })} />
        </div>
        <div className="bio-col sheet-section">
          <TextBlock label="Personality Traits" value={value.personality} disabled={!canEdit} onChange={(personality) => update({ personality })} />
          <TextBlock label="Appearance" value={value.appearance} disabled={!canEdit} onChange={(appearance) => update({ appearance })} />
        </div>
      </div>

      <div className="bio-block sheet-section">
        <label>Biography</label>
        <textarea
          className="bio-full"
          value={value.backstoryPersonality}
          disabled={!canEdit}
          rows={8}
          onChange={(e) => update({ backstoryPersonality: e.target.value })}
        />
      </div>
    </div>
  );
}
