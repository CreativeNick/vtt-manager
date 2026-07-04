import {
  abilityModifier,
  DEFAULT_SHEET_TEMPLATE,
  derivedStatTotal,
  formatModifier,
  rowId,
  type ToolEntry,
} from "../../../lib/types";
import { NumberInput } from "../../NumberInput";
import { PillList, ProfDot, SectionHeader } from "../atoms";
import { advFromEvent, ROLL_HINT, type SheetEdit } from "../context";

const template = DEFAULT_SHEET_TEMPLATE;

/** Ability abbreviation for a save/skill's governing ability. */
function abilityAbbr(abilityId: string): string {
  return template.abilities.find((a) => a.id === abilityId)?.abbr ?? "";
}

/**
 * The Main page (PC): ability blocks, skills (prof dot + passive), tools, saving
 * throws, and the proficiency/resistance/language pill lists. NPCs render the ability
 * blocks + saves at the top of their Features page instead (see AbilityHeader).
 */
export function MainPage({ sheet }: { sheet: SheetEdit }) {
  const { value, canEdit, update, onRollCheck } = sheet;

  return (
    <div className="sheet-page main-page">
      <AbilityRow sheet={sheet} />

      <div className="main-columns">
        <div className="main-col">
          <SectionHeader title="Skills" />
          {template.skills.map((skill) => {
            const manual = value.skillMods[skill.id] ?? 0;
            const total = derivedStatTotal(skill, manual, value.abilityScores);
            const prof = value.skillProfs[skill.id] ?? 0;
            return (
              <div className="skill-row" key={skill.id}>
                <ProfDot
                  level={prof}
                  max={2}
                  disabled={!canEdit}
                  title={`${skill.name} proficiency`}
                  onCycle={(next) => update({ skillProfs: { ...value.skillProfs, [skill.id]: next } })}
                />
                <span className="skill-abbr">{abilityAbbr((skill as { abilityId?: string }).abilityId ?? "")}</span>
                <span className="skill-name">{skill.name}</span>
                {canEdit ? (
                  <NumberInput className="skill-mod-input" value={manual} onCommit={(next) => update({ skillMods: { ...value.skillMods, [skill.id]: next } })} aria-label={`${skill.name} modifier`} />
                ) : null}
                {onRollCheck ? (
                  <button className="skill-total roll-btn" title={`${skill.name} — ${ROLL_HINT}`} onClick={(e) => onRollCheck({ kind: "skill", statId: skill.id }, advFromEvent(e))}>
                    {formatModifier(total)}
                  </button>
                ) : (
                  <span className="skill-total">{formatModifier(total)}</span>
                )}
                <span className="skill-passive" title="Passive">{10 + total}</span>
              </div>
            );
          })}

          <ToolsSection sheet={sheet} />
        </div>

        <div className="main-col">
          <SectionHeader title="Saving Throws" />
          <div className="saves-grid">
            {template.saves.map((save) => {
              const manual = value.saveMods[save.id] ?? 0;
              const total = derivedStatTotal(save, manual, value.abilityScores);
              const prof = value.saveProfs[save.id] ?? 0;
              return (
                <div className="save-row" key={save.id}>
                  <ProfDot level={prof} max={1} disabled={!canEdit} title={`${save.name} save proficiency`} onCycle={(next) => update({ saveProfs: { ...value.saveProfs, [save.id]: next } })} />
                  <span className="save-name">{save.name}</span>
                  {onRollCheck ? (
                    <button className="save-total roll-btn" title={`${save.name} save — ${ROLL_HINT}`} onClick={(e) => onRollCheck({ kind: "save", statId: save.id }, advFromEvent(e))}>
                      {formatModifier(total)}
                    </button>
                  ) : (
                    <span className="save-total">{formatModifier(total)}</span>
                  )}
                  {canEdit ? (
                    <NumberInput className="save-mod-input" value={manual} onCommit={(next) => update({ saveMods: { ...value.saveMods, [save.id]: next } })} aria-label={`${save.name} save modifier`} />
                  ) : null}
                </div>
              );
            })}
          </div>

          <PillList label="Resistances" values={value.resistances} canEdit={canEdit} onChange={(resistances) => update({ resistances })} />
          <PillList label="Immunities" values={value.immunities} canEdit={canEdit} onChange={(immunities) => update({ immunities })} />
          <PillList label="Vulnerabilities" values={value.vulnerabilities} canEdit={canEdit} onChange={(vulnerabilities) => update({ vulnerabilities })} />
          <PillList label="Condition Immunities" values={value.conditionImmunities} canEdit={canEdit} onChange={(conditionImmunities) => update({ conditionImmunities })} />
          <PillList label="Armor" values={value.armorProfs} canEdit={canEdit} onChange={(armorProfs) => update({ armorProfs })} />
          <PillList label="Weapons" values={value.weaponProfs} canEdit={canEdit} onChange={(weaponProfs) => update({ weaponProfs })} />
          <PillList label="Languages" values={value.languages} canEdit={canEdit} onChange={(languages) => update({ languages })} />
        </div>
      </div>
    </div>
  );
}

/** Six ability blocks (abbr, modifier, score). Reused by the NPC Features header. */
export function AbilityRow({ sheet }: { sheet: SheetEdit }) {
  const { value, canEdit, update, onRollCheck } = sheet;
  return (
    <div className="ability-row">
      {template.abilities.map((ability) => {
        const score = value.abilityScores[ability.id] ?? 10;
        const mod = abilityModifier(score);
        return (
          <div className="ability-block" key={ability.id}>
            <div className="ability-block-abbr">{ability.abbr}</div>
            {onRollCheck ? (
              <button className="ability-block-mod roll-btn" title={`${ability.name} check — ${ROLL_HINT}`} onClick={(e) => onRollCheck({ kind: "ability", abilityId: ability.id }, advFromEvent(e))}>
                {formatModifier(mod)}
              </button>
            ) : (
              <div className="ability-block-mod">{formatModifier(mod)}</div>
            )}
            {canEdit ? (
              <NumberInput className="ability-block-score" value={score} min={1} allowNegative={false} onCommit={(next) => update({ abilityScores: { ...value.abilityScores, [ability.id]: next } })} aria-label={ability.name} />
            ) : (
              <div className="ability-block-score">{score}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** An inline saving-throw row shown under the NPC ability blocks. */
export function SavesRow({ sheet }: { sheet: SheetEdit }) {
  const { value, onRollCheck } = sheet;
  return (
    <div className="npc-saves-row">
      {template.saves.map((save) => {
        const total = derivedStatTotal(save, value.saveMods[save.id] ?? 0, value.abilityScores);
        return (
          <button
            type="button"
            key={save.id}
            className="npc-save-chip roll-btn"
            disabled={!onRollCheck}
            title={`${save.name} save`}
            onClick={(e) => onRollCheck?.({ kind: "save", statId: save.id }, advFromEvent(e))}
          >
            <span>{abilityAbbr((save as { abilityId?: string }).abilityId ?? "")}</span>
            <span className="total">{formatModifier(total)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ToolsSection({ sheet }: { sheet: SheetEdit }) {
  const { value, canEdit, update, onRollCheck } = sheet;
  const addTool = () =>
    update({ tools: [...value.tools, { id: rowId("tool"), name: "New tool", mod: 0 } as ToolEntry] });
  return (
    <>
      <SectionHeader title="Tools" onAdd={canEdit ? addTool : undefined} />
      {value.tools.length === 0 ? <span className="muted rt-empty">No tools.</span> : null}
      {value.tools.map((tool, index) => (
        <div className="skill-row" key={tool.id}>
          <span className="skill-abbr" />
          {canEdit ? (
            <input
              className="skill-name"
              value={tool.name}
              onChange={(e) => update({ tools: value.tools.map((t, i) => (i === index ? { ...t, name: e.target.value } : t)) })}
            />
          ) : (
            <span className="skill-name">{tool.name}</span>
          )}
          {canEdit ? (
            <NumberInput className="skill-mod-input" value={tool.mod} onCommit={(mod) => update({ tools: value.tools.map((t, i) => (i === index ? { ...t, mod } : t)) })} aria-label={`${tool.name} modifier`} />
          ) : null}
          {onRollCheck ? (
            <button className="skill-total roll-btn" title={`${tool.name} — ${ROLL_HINT}`} onClick={(e) => onRollCheck({ kind: "tool", toolId: tool.id }, advFromEvent(e))}>
              {formatModifier(tool.mod)}
            </button>
          ) : (
            <span className="skill-total">{formatModifier(tool.mod)}</span>
          )}
          {canEdit ? (
            <button className="btn-ghost icon-btn" title="Remove" onClick={() => update({ tools: value.tools.filter((_, i) => i !== index) })}>✕</button>
          ) : (
            <span />
          )}
        </div>
      ))}
    </>
  );
}
