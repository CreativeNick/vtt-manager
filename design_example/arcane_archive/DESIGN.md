---
name: Arcane Archive
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#d1c5b4'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#9a8f80'
  outline-variant: '#4e4639'
  surface-tint: '#e9c176'
  primary: '#e9c176'
  on-primary: '#412d00'
  primary-container: '#c5a059'
  on-primary-container: '#4e3700'
  inverse-primary: '#775a19'
  secondary: '#d5c5a1'
  on-secondary: '#392f16'
  secondary-container: '#50462a'
  on-secondary-container: '#c3b491'
  tertiary: '#c8c6c5'
  on-tertiary: '#313030'
  tertiary-container: '#a7a5a5'
  on-tertiary-container: '#3b3b3b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdea5'
  primary-fixed-dim: '#e9c176'
  on-primary-fixed: '#261900'
  on-primary-fixed-variant: '#5d4201'
  secondary-fixed: '#f2e1bb'
  secondary-fixed-dim: '#d5c5a1'
  on-secondary-fixed: '#231b04'
  on-secondary-fixed-variant: '#50462a'
  tertiary-fixed: '#e5e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1c1b1b'
  on-tertiary-fixed-variant: '#474746'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: EB Garamond
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: EB Garamond
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
  headline-md:
    fontFamily: EB Garamond
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: Libre Franklin
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Libre Franklin
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  stats-lg:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 24px
  stats-sm:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.05em
  label-caps:
    fontFamily: Libre Franklin
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-edge: 24px
  panel-padding: 20px
  stack-sm: 8px
  stack-md: 16px
---

## Brand & Style
The design system embodies the atmosphere of a dimly lit wizard’s study—equal parts ancient mystery and meticulous scholarship. The target audience consists of tabletop gamers who value immersion as much as functional clarity. 

The visual style is **Skeuomorphic & Tactile**, blending high-fantasy artifacts with modern digital precision. Surfaces should feel physical, utilizing weathered parchment textures and obsidian stone finishes. Interaction patterns take inspiration from illuminated manuscripts, where "gold leaf" is used not just for decoration, but to guide the eye toward critical interactive elements and active states.

## Colors
The palette is rooted in a "Dark Fantasy" aesthetic, prioritizing high legibility in low-light environments.

- **Primary (Burnished Gold):** Reserved for "Magic" actions, active states, and critical successes. It represents energy and interaction.
- **Secondary (Weathered Parchment):** Used primarily for typography and iconography that requires high contrast against dark backgrounds.
- **Surface (Deep Charcoal):** The primary container color, representing a heavy, textured stone or leather.
- **Background (Obsidian):** The deepest layer, providing a void-like backdrop that makes the UI "pop" forward.

## Typography
The typographic scale distinguishes between "Narrative" and "System" information.

- **Headlines (EB Garamond):** Used for titles, location names, and character names. It provides a literary, historical feel.
- **Body (Libre Franklin):** Used for long-form spell descriptions and lore. It offers a clean, neutral balance to the ornate headlines.
- **Data (JetBrains Mono):** Used for HP, Armor Class, and mathematical modifiers. The monospaced nature ensures that numbers align perfectly in tables and character sheets, reinforcing the "precision tool" aspect of the VTT.

## Layout & Spacing
The layout follows a **Fixed Sidebar / Fluid Canvas** model. The central "Tabletop" (Map) is a fluid area, while character sheets and toolbars are fixed-width panels that evoke the feeling of heavy physical trays or folders.

Spacing is tight and systematic (4px base) to allow for the high density of information required during combat. Margins between the UI and the screen edge should be generous to prevent the interface from feeling claustrophobic against the map.

## Elevation & Depth
Depth is created through material layering rather than traditional drop shadows.

- **Level 0 (The Map):** The base layer.
- **Level 1 (The Tray):** Obsidian containers (#0d0d0d) with a 1px inner stroke of #1a1a1a to define edges.
- **Level 2 (The Sheet):** Parchment-textured panels that sit atop the obsidian trays. These use a subtle 4px "ink-bleed" shadow (low opacity black) to separate them from the stone.
- **Level 3 (Pop-overs/Tooltips):** These use gold-leaf borders (1px solid #c5a059) to indicate they are temporary, high-importance overlays.

## Shapes
The design system avoids aggressive curves. Small radii (4px) are used for "Parchment" elements to mimic hand-cut paper. Buttons and interactive slots use 0px (Sharp) corners or "Clipped" corners (diagonal 45-degree cuts) to evoke the feel of chiseled stone or forged metal.

## Components
- **Buttons:** Primary buttons feature a "Burnished Gold" fill with black text. Secondary buttons are "Obsidian" with a gold 1px border. Hover states should trigger a "glow" effect (box-shadow: 0 0 10px #c5a059).
- **Stat Chips:** Small, dark octagonal or hexagonal containers for numbers (AC, Speed). Use JetBrains Mono for the value.
- **Input Fields:** Styled as "Underlined" text entries rather than boxes, mimicking a scribe's ledger.
- **Cards (Spells/Items):** A mix of Obsidian headers and Parchment bodies. The transition between the two should be marked by a gold horizontal rule.
- **Checkboxes:** Styled as "Runic Orbs" that fill with a golden light when toggled on.
- **Health Bars:** Thick, textured bars. The background is a "Dried Blood" dark red, and the fill is a vibrant "Vitality" red, capped with a gold border when at maximum health.