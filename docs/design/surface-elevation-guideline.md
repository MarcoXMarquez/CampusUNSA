# Surface, Elevation, Bevel, and Interaction Heuristics

Status: **Proposed mandatory design-system contract for review**  
Scope: CampusUNSA frontend (Next.js/React PWA, Konsta UI, Tailwind) in light and dark modes.  
Repository target: `docs/design/surface-elevation-guideline.md`.  
Related authorities: repository `AGENTS.md` section 3.2, `docs/design/DESIGN.md`, `docs/design/apple-ios-palette-guideline.md`, `frontend/src/app/globals.css`, and `frontend/tailwind.config.js`.

### 1. Purpose and authority

The previous handoff described `surface-elevated`, `surface-inset`, and the dock shadow, but did not prescribe *when* a component receives a fill, outer shadow, inner bevel, border, or interactive highlight. This document closes that gap with a deterministic classification procedure for existing and future screens.

A semantic **surface color is not an elevation level**: `bg-surface-elevated` can have **no shadow**. An urgency/status color is not an elevation level either. The default for new components is flat (`E0`) unless a rule below authorizes a higher level.

**Authority order**:
1. Preserve product behavior, `AGENTS.md` engineering requirements, accessibility, and existing API/sync contracts.
2. For a screen with approved Stitch reference and `DESIGN.md` geometry, reproduce the approved spatial hierarchy and map visual effects to semantic tokens. Do not use these defaults to arbitrarily flatten a verified Stitch design.
3. For missing/ambiguous depth information, apply the decision algorithm and matrix below.
4. Any non-matrix exception needs a written role/justification and new or reused semantic tokens; never invent inline styles in a component.
5. If an approved visual reference conflicts with accessibility, behavior, or this matrix, document the conflict and request a design decision rather than silently guessing.

This is a **CampusUNSA product heuristic**, not a claim that every rule is mandated by Apple's Human Interface Guidelines or that browser CSS produces native iOS behavior.

### 2. Distinguish independent visual dimensions

For each component define these independent dimensions, in this order:

| Dimension | Question | Available values | Anti-pattern |
|---|---|---|---|
| Surface role | What is this region's base material? | `canvas`, `sheet`, `card`, `elevated`, `inset`, `hero`, `urgent` | Using `elevated` as a synonym for `shadow` |
| Spatial layer | Does it visually overlap unrelated content? | `E0`, `E1`, `E2`, `E3` | Shadowing every card |
| Boundary | Must the component be separated from a similar neighbor? | `none`, `separator`, `subtle`, `control`, `urgent` | Border + shadow + bevel everywhere |
| Shape | What is its component family? | `row`, `group`, `control`, `pill`, `sheet`, `dock` | Changing radii per screen |
| Material effect | Does material depth serve a functional cue? | `none`, `selected-segment-bevel`, `glass-dock-bevel` | Applying bevel to static content |
| Interaction | Which user state is active? | `default`, `hover`, `pressed`, `selected`, `focus-visible`, `disabled`, `loading` | Treating hover as selected |
| Semantic emphasis | Is the content urgent or important? | `neutral`, `brand`, `soon`, `urgent`, `success` | Using a heavy shadow to communicate urgency |

**Never infer one dimension from another.** In particular, `surface-hero` does not imply E1; `brand-cta` does not imply E2; `selected` does not automatically imply shadow.

### 3. Elevation levels: exact selection rules

| Level | Meaning | Allowed roles | Shadow | Bevel | Forbidden by default |
|---|---|---|---|---|---|
| **E0 / flat** | In the normal document flow, no overlap or lift | all static rows, groups, input fields, standard buttons, hero and status cards | `none` | `none` | raising a card just because it is white |
| **E1 / subtle raised control** | A *discrete selected thumb* visibly sits above an inset segmented track, or an exceptional standalone selectable surface requires gentle separation | selected segment, approved standalone raised control | `shadow-layer-segment` (composite raised + subtle bevel) | `bevel-selected` as part of the shared composite only | applying to every selected filter pill or card |
| **E2 / temporary overlay** | A transient sheet, popover, menu, toast, or dialog is visually layered over the page | modal sheet, popover, menu, toast | `shadow-layer-overlay` | `none` | stacking E2 on every nested card inside a sheet |
| **E3 / persistent floating navigation** | Persistent free-floating navigation above scrollable content | existing liquid-glass dock and protruding center create action | `shadow-layer-dock` or purpose-specific `shadow-layer-fab` | `bevel-glass` *dock only* | other cards, lists, search inputs, standard CTAs |

#### Mandatory decision procedure (first applicable rule wins)

1. **Modal or popup?** If it temporarily occludes unrelated content, assign E2 and `surface-sheet`/appropriate modal background. The modal overlay/dim layer is a separate treatment; child form groups stay E0.
2. **Persistent floating navigation?** If it remains above scrolling content and is deliberately detached from the page, assign E3, but only to the existing dock family and center create action. Reuse dock-specific CSS effects and safe-area handling.
3. **Selected control sitting inside an inset track?** Assign E1 to the selected *segment/thumb only*. Track remains E0 `surface-inset`. In other control families, selection is expressed via fill/tint/border instead.
4. **Ordinary in-flow content?** Assign E0, including overdue content, the next-class hero, course rows, and Hugo connection cards. Use a surface/border/separator for grouping, not drop shadow.
5. **Exceptional separation problem?** Consider E1 only if a standalone interactive control shares indistinguishable boundaries with its surrounding surface and a plain border/increased contrast cannot solve it. Record why alternatives failed; obtain review for a new role.
6. **No explicit justification?** Assign E0. Do not introduce an effect token for decoration alone.

**Composition constraint:** a parent already at E2/E3 does not automatically elevate descendants. A sheet can contain E0 cards and one E1 segmented thumb. Avoid nested E2 shadows.

### 4. Component-to-property matrix (binding defaults)

| Component family / example | Surface | Level | Border / divider | Radius family | Shadow | Bevel | Interactive behavior |
|---|---|---|---|---|---|---|---|
| App canvas, background | `canvas` | E0 | none | none | none | none | none |
| Grouped task list container | `card` | E0 | `subtle` outer edge **or** inset row separators | `group` | none | none | only interactive rows respond on fine-pointer hover |
| Normal task row / course row | inherits `card` | E0 | inset separator between siblings | `row` from group | none | none | pressed highlight + focus-visible |
| Historic overdue task row | `card`, optionally narrowly scoped `urgent` section | E0 | optional `urgent` marker/edge, not full shadow | row/group | none | none | same as ordinary task; due label remains red |
| Next-class hero | `hero` | E0 | `subtle` or contextual edge | `group` | none | none | only actual actions interactive |
| Hugo connection panel | `card` | E0 | `subtle` if necessary | `group` | none | none | CTA has its own pressed state |
| Text input, search, text area | `card` or `elevated` depending on parent contrast | E0 | `control` only as needed | `control` | none | none | semantic focus-visible ring, no hover shadow |
| Segmented control background | `inset` | E0 | none | `control` | none | none | nonselectable track |
| **Selected segment thumb** | `elevated` | **E1** | very subtle optional edge | `control` | `segment` (shared composite) | `selected` within composite | persistent selected state; hover is separate |
| Unselected segment | track (`inset`) | E0 | none | `control` | none | none | pressed response; text secondary |
| Filter / quick-date pill (default) | `elevated` | E0 | subtle optional | `pill` | none | none | fine-pointer hover and pressed response |
| Filter / quick-date pill (selected) | brand tint/selection token | E0 | brand selection edge optional | `pill` | none | none | selected indicated by fill and label/aria-pressed |
| Primary solid CTA | `brand-cta` | E0 | none or consistent CTA edge | `pill`/`control` | none | none | hover via brand hover token on fine pointer, pressed on touch |
| Disabled CTA | disabled-state material | E0 | none | existing family | none | none | disabled; no hover; visible explanation if necessary |
| Switch | system/Konsta track material | E0 | system control edge | `pill` | knob effect only if supplied by shared primitive | none | checked is not hover |
| Form group inside modal | `card` | E0 | subtle dividers | `group` | none | none | form controls own focus |
| **Bottom sheet / dialog** | `sheet` | **E2** | optional top/outer edge | `sheet` | `overlay` | none | backdrop, focus, Escape, scroll/safe area |
| Floating menu / tooltip / toast | `sheet`/`card` | E2 | subtle if useful | `group` | `overlay` | none | dismissal/focus requirements |
| **Liquid-glass bottom dock** | existing `lg-dock-*` material | **E3** | existing glass perimeter | `dock` | existing dock shadow token | existing dock bevel | fixed position, safe-area clearance, reduced-motion fallback |
| **Center create action** | `brand-cta` | **E3** | approved perimeter edge | `pill` | `fab` token | none | hover/pressed/focus; do not obscure labels or last row |
| Inline success/urgent/soon alert | `card` or contextual semantic fill | E0 | semantic edge if needed | `group` | none | none | color plus icon/label; no elevation-by-severity |
| Empty/error/loading placeholders | canvas/card context | E0 | as parent | as parent | none | none | meaningful states; no fake interactivity |

**No shadow by default** on every task card, every standard pill, all status banners, every hero, or a normal CTA. Shadow is a statement about layering, not importance.

### 5. Boundary selection and surface precedence

1. Use a **separator** for adjacent rows within a single grouped list. Do not outline every row separately when the group itself supplies the boundary.
2. Use `border-subtle` for a container against canvas when the boundary is useful. Prefer a boundary *or* E1 shadow, not both; only add both when contrast tests demonstrate a need.
3. Use `border-control` for editable inputs or control wells when surface difference is insufficient.
4. Use `border-urgent` only for clearly marked exceptions; it does not imply a raised layer. Keep long historical overdue lists visually quiet.
5. A shadow is never used as the only indicator of a clickable or selected component.
6. Use existing radius utilities by **component family** (`row`, `group`, `control`, `pill`, `sheet`, `dock`). Define family mapping centrally if missing; do not invent arbitrary `rounded-[...]` on each new screen.

**Inset vs bevel:** `surface-inset` is a recessed **color field**, primarily a segmented track. An inset bevel (`inset ... box-shadow`) is a separate optical detail and is *not* automatically added when `surface-inset` is used.

### 6. Interaction state machine (not arbitrary visual effects)

| State | Trigger | Permitted visual response | Prohibited response |
|---|---|---|---|
| Default | no interaction | semantic base surface, border, text | fake raised look without role |
| Hover | `@media (hover: hover) and (pointer: fine)` AND interactive AND enabled | subtle tint/border or existing `brand-cta-hover`; optional cursor | persistent mobile hover, lift/zoom, increased shadow by default |
| Pressed | `:active`/pointer press, touch or mouse | short fill/tint change, optional minimal scale only where approved | sticky state or moving surrounding layout |
| Selected | `aria-selected`/`aria-pressed`/checked state, persists | semantic brand tint, explicit selected indicator, selected segment E1 only | treating selected as generic hover or raising every selected pill |
| Focus-visible | keyboard focus (`:focus-visible`) | visible semantic outline/ring, independent of hover/selected | removing outline or relying on shadow alone |
| Disabled | actual disabled semantics | muted text/fill, unchanged position | hover, press, focus trap or misleading CTA |
| Loading/busy | in-progress action | spinner/status, stable dimensions, `aria-busy` as appropriate | duplicated requests, fake completion or shape jump |
| Error/urgent | domain state | status text/icon/border, accessible messaging | elevation increase or animation as sole alert |

Precedence: disabled/busy blocks hover and pressed behavior; focus-visible is an additive accessibility cue; pressed overrides hover while active; selected persists independently. Use opacity only if final content still meets required contrast; do not blindly set `opacity-50` for text.

The Tailwind `hover:` variant may remain in existing code while migrating, but future shared interaction styles MUST gate hover effects to fine pointers in semantic CSS or an agreed Tailwind variant. Touch must receive `pressed` feedback, not a sticky hover simulation.

### 7. Effect tokens and allowed implementation location

Tokens live **only** in `frontend/src/app/globals.css` and map to reusable utilities in `frontend/tailwind.config.js` or shared CSS component classes. React components select a semantic effect class; they must NOT define numerical shadow, inset bevel, blur, or hover values inline. Never use arbitrary `shadow-sm`, `shadow-lg`, `shadow-2xl`, arbitrary `drop-shadow`, or inline `style={{ boxShadow: ... }}` in new/updated UI components unless a documented domain exception is reviewed.

The following is a **starting target for review**, not a claim that these variables already exist:

```css
:root {
  --effect-shadow-flat: none;
  --effect-shadow-raised: 0 1px 3px rgb(0 0 0 / 0.10);
  --effect-shadow-overlay: 0 14px 36px rgb(0 0 0 / 0.18);
  --effect-shadow-dock: var(--lg-dock-shadow);
  --effect-shadow-fab: 0 8px 22px rgb(0 0 0 / 0.24);
  --effect-bevel-selected: inset 0 1px 0 rgb(255 255 255 / 0.72);
  --effect-shadow-segment: var(--effect-shadow-raised), var(--effect-bevel-selected);
  --effect-hover-overlay: 0 0 0 / 0.04;
  --effect-pressed-overlay: 0 0 0 / 0.08;
}
@media (prefers-color-scheme: dark) {
  :root {
    --effect-shadow-raised: 0 1px 3px rgb(0 0 0 / 0.28);
    --effect-shadow-overlay: 0 18px 44px rgb(0 0 0 / 0.56);
    --effect-shadow-dock: var(--lg-dock-shadow);
    --effect-shadow-fab: 0 8px 22px rgb(0 0 0 / 0.52);
    --effect-bevel-selected: inset 0 1px 0 rgb(255 255 255 / 0.12);
    --effect-shadow-segment: var(--effect-shadow-raised), var(--effect-bevel-selected);
    --effect-hover-overlay: 255 255 255 / 0.06;
    --effect-pressed-overlay: 255 255 255 / 0.10;
  }
}
```

Tailwind mapping must use stable semantic keys, for example:

```js
boxShadow: {
  "layer-flat": "var(--effect-shadow-flat)",
  "layer-raised": "var(--effect-shadow-raised)",
  "layer-segment": "var(--effect-shadow-segment)",
  "layer-overlay": "var(--effect-shadow-overlay)",
  "layer-dock": "var(--effect-shadow-dock)",
  "layer-fab": "var(--effect-shadow-fab)",
},
```

For a selected segment, use the **single composite token** `shadow-layer-segment`; it includes both the gentle E1 outside shadow and the selected-thumb inner highlight. Avoid two competing `box-shadow` declarations on the same element. If contrast testing rejects the highlight, adjust the composite centrally rather than patching individual buttons. Preserve the existing `lg-dock-*` properties as the **single source** for dock glass optical tuning; avoid a competing second implementation.

**Important:** Light/dark effect values are candidates until verified against the final theme tokens, actual screenshots, contrast and perceived separation. The decision rules, not the example numbers, are the durable contract. Avoid duplicate hardcoded values in tokens JSON, Tailwind and component files.

### 8. Example migration decisions for current CampusUNSA files

| Existing file | Observed pattern | Required decision | Scope |
|---|---|---|---|
| `frontend/src/components/views/hoy/TaskCardRow.tsx` | overdue row has `shadow-sm` | E0: remove card shadow; retain accessible urgency wording and contextual edge | visual only |
| `frontend/src/components/sheets/NewTaskSheet.tsx` | sheet has `shadow-2xl` | E2: replace with `shadow-layer-overlay` | visual only |
| `frontend/src/components/sheets/NewTaskSheet.tsx` | selected segmented option has `shadow-sm` | E1: `shadow-layer-segment` composite; unselected E0 | visual only |
| `frontend/src/components/sheets/NewTaskSheet.tsx` | quick-date pills use surface fill/border | E0: no shadows on either selected or unselected pills | preserve selection |
| `frontend/src/components/navigation/BottomTabBar.tsx` | floating glass dock | E3: preserve `--lg-dock-shadow`, edge highlights and safe area behavior; map documented role | preserve navigation |
| `frontend/src/components/navigation/BottomTabBar.tsx` | center red `+` overlaps dock | E3: semantic FAB effect, not a generic card shadow | preserve add action |
| Schedule hero, course groups, Hugo connect panel | in-flow emphasized panels | E0: semantic surfaces/borders, no default shadow | visual only |

Do not change `allSourcesSynced`; source availability and task-gating are product behavior, not visual layering concerns.

### 9. New-screen design procedure and review record

For every new screen and every new shared component, the design review MUST log:

```text
Component: <stable name>
Context / parent surface: <canvas, card, sheet, ...>
Function: <static information / editable / selectable / floating action / overlay>
Overlap model: <none / temporary overlay / persistent floating>
Surface token: <...>
Elevation level: <E0/E1/E2/E3>
Boundary: <none / separator / subtle / control / urgent>
Radius family: <row/group/control/pill/sheet/dock>
Shadow token: <none / raised / overlay / dock / fab>
Bevel token: <none / selected / glass>
Default/selected/hover/pressed/focus-visible/disabled/loading: <state behavior>
Light/Dark and forced-colors: <checked>
Touch / fine-pointer / keyboard: <checked>
Source: <approved Stitch frame or default heuristic rule number>
Exception and reviewer: <none or rationale>
```

Two components with the same function, parent surface and interaction model MUST produce the same role/elevation/effects irrespective of which page creates them. Reuse an existing component before introducing a new shared primitive.

### 10. Acceptance and automated enforcement

#### Visual acceptance
- Task rows and status/hero panels remain E0 in both modes; no elevation-by-urgency.
- Segmented track is inset E0; selected thumb is the only E1 item in that control.
- Modal sheet is E2; nested form panels remain E0.
- Existing glass dock and floating add control are E3; scroll padding and safe areas are preserved.
- No excess stacked strokes: avoid simultaneously applying a strong border, a full drop shadow and a bevel to normal cards.
- No hover effects on touch-only devices; pressed, focus-visible, selected and disabled are distinguishable.
- Dark theme uses material/border separation when shadows are imperceptible; no glowing white outlines for generic cards.
- Reduced-motion behavior and high-contrast usability are verified.

#### Structural acceptance
- No raw shadow geometry, bevel values, CSS color literals, or arbitrary typography values inside updated `frontend/src/components/`.
- Reusable effect tokens are centralized and type-safe components use shared classes, not per-screen formulas.
- Run `node scripts/verify-ui-directives.mjs` to reject generic and arbitrary shadow utilities, drop shadows, and inline box-shadow in components. Keep the component matrix as the review standard for choosing a semantic shadow.
- Create unit/component visual tests for selected segmented thumb, focus, press, hover capability, the sheet, the dock and task rows; validate a screen with no shadow where E0 is mandated.
- Capture real light/dark browser/PWA screenshots (no fake status bar), at narrow/mobile and tablet widths. Validate overlap, contrast and disabled states.

#### Scope guard
These rules govern presentation only. Do not change authentication, synchronization gates, API payloads, course-colour assignment, localization or data grouping in order to satisfy an elevation rule.
