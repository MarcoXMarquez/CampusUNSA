# CampusUNSA Apple iOS Design System & Palette Guideline

## 1. Visual Reference Boards

This guideline establishes the canonical color tokens, surface hierarchy, and typography scale for `frontend/`, reconciling the Apple Human Interface Guidelines (iOS HIG) semantic layering model with the UNSA institutional crimson identity (`#8B0000`) and all Stitch screens designed for CampusUNSA.

- **Interactive HTML Specimen (Light & Dark toggle):** [apple-ios-design-system.html](apple-ios-design-system.html)
- **Dark Mode Reference Board (OLED):** [apple-ios-design-system-dark.png](apple-ios-design-system-dark.png)
- **Light Mode Reference Board (iOS Grouped):** [apple-ios-design-system-light.png](apple-ios-design-system-light.png)

---

## 2. Why Apple HIG Semantic Layering Differs from Material 3

Google's Material 3 / Stitch Theme Builder (`Academic iOS Design System`) generates numeric tonal ramps (`surface-container-low`, `high`, `highest`, `primary-10..90`). By contrast, Apple's iOS Human Interface Guidelines define **adaptive semantic roles** across four vertical layers, rather than screen-specific hex variants:

1. **Canvas (`systemGroupedBackground`):** Root viewport (`#F2F2F7` light, `#000000` dark).
2. **Sheet (`surface-sheet`):** Modal drawer backdrop (`#FFFFFF` light, `#121214` dark).
3. **Grouped Card (`secondarySystemGroupedBackground`):** Inset grouped containers and rows (`#FFFFFF` light, `#1C1C1E` dark).
4. **Elevated Control (`tertiarySystemGroupedBackground`):** Inputs, quick-date pills, active segments, and inline pickers (`#E5E5EA` light, `#2C2C2E` dark).

---

## 3. Canonical Color Token Matrix & Legacy Consolidation

These values match the RGB custom properties used by the application. Small text uses contrast-adjusted secondary, muted, and status tones. Disabled labels use separate tones.

| Semantic token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--bg-canvas` | `#F2F2F7` | `#000000` | Overall application background |
| `--surface-sheet` | `#FFFFFF` | `#121214` | Modal sheets and overlays |
| `--surface-card` | `#FFFFFF` | `#1C1C1E` | Grouped lists and cards |
| `--surface-elevated` | `#E5E5EA` | `#2C2C2E` | Controls, active cells |
| `--surface-inset` | `#E5E5EA` | `#2C2C2E` | Recessed segmented controls |
| `--surface-hero` | `#FCEBEC` | `#1D0F12` | Next-class feature area |
| `--surface-urgent` | `#FDE8E8` | `#241717` | Overdue emphasis, sparingly |
| `--border-subtle` | `#E5E5EA` | `#2C2C2E` | Grouped list separators |
| `--border-control` | `#C7C7CC` | `#3A3A3C` | Control outlines |
| `--border-urgent` | `#F5C2C4` | `#4A1C21` | Overdue card edge |
| `--ink-primary` | `#000000` | `#FFFFFF` | Headlines and task titles |
| `--ink-secondary` | `#606065` | `#AEAEB2` | Metadata, inactive navigation |
| `--ink-muted` | `#66666C` | `#99999E` | Placeholders, helper text |
| `--ink-disabled` | `#AEAEB2` | `#636366` | Disabled control labels |
| `--brand-cta` | `#8B0000` | `#990000` | Primary solid action |
| `--brand-cta-hover` | `#A51C30` | `#B2182B` | Primary action pressed |
| `--brand-action` | `#BA131A` | `#F56B70` | Text actions and selected tabs |
| `--brand-tint` | `#C72C41` | `#FF3B5C` | Supporting emphasis text |
| `--status-urgent` | `#BA0013` | `#FF453A` | Urgent deadlines and errors |
| `--status-soon` | `#805000` | `#FFD60A` | Upcoming time-sensitive items |
| `--status-success` | `#1F6F32` | `#30D158` | Successful connection / saves |

### Domain Exceptions (Preserved Outside UI Semantic Tokens)

- **Course Identity Palette (`frontend/src/lib/schedule-calculator.ts`):** 7 deterministic dot colors distinguishing enrolled courses (`#3B82F6`, `#D946EF`, `#F59E0B`, `#10B981`, `#06B6D4`, `#F43F5E`, `#8B5CF6`).
- **Google Identity Brand (`frontend/src/components/auth/GoogleSignInButton.tsx`):** Official Google G glyph colors (`#4285F4`, `#34A853`, `#FBBC05`, `#EA4335`) and button chrome required by Google OAuth branding guidelines.

---

## 4. Typography Scale (SF Pro Dynamic Type)

CampusUNSA uses the native Apple system font stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, "Segoe UI", Roboto, sans-serif`) without external web-font requests to guarantee offline PWA resilience. All text sizes consolidate to the 11 Apple HIG levels:

| Style Token | Size | Weight | Line Height | Optical Variant | Primary Usage |
| :--- | :---: | :---: | :---: | :--- | :--- |
| `ios-large-title` | `34px` | `700` (Bold) | `41px` | SF Pro Display | Root navigation headers (`Tareas`, `Horario`) |
| `ios-title-1` | `28px` | `700` (Bold) | `34px` | SF Pro Display | Next-class clock (`08:40`) |
| `ios-title-2` | `22px` | `700` (Bold) | `28px` | SF Pro Display | Date picker summary headline, detail titles |
| `ios-title-3` | `20px` | `600` (Semibold) | `25px` | SF Pro Display | Hero banner titles |
| `ios-headline` | `17px` | `600` (Semibold) | `22px` | SF Pro Text | Modal titles, navbar actions, card group titles |
| `ios-body` | `17px` | `400` (Regular) | `22px` | SF Pro Text | Standard body paragraphs |
| `ios-callout` | `16px` | `400` (Regular) | `21px` | SF Pro Text | Course picker items, time picker value |
| `ios-subhead` | `15px` | `400` (Regular) | `20px` | SF Pro Text | Form labels, task rows, input fields |
| `ios-footnote` | `13px` | `400` (Regular) | `18px` | SF Pro Text | Section headers, quick pills, descriptions |
| `ios-caption-1` | `12px` | `500` (Medium) | `16px` | SF Pro Text | Metadata timestamps, status badges |
| `ios-caption-2` | `11px` | `600` (Semibold) | `13px` | SF Pro Text | Bottom navigation bar labels, priority tags |

*(Eliminates non-standard sizes previously present in components: `10px`, `13.5px`, `23px`, and `26px`.)*

### Floating Liquid Glass Dock Tokens (`frontend/src/app/globals.css`)

| Token | Light (`:root`) | Dark (`prefers-color-scheme: dark`) | Purpose |
| :--- | :--- | :--- | :--- |
| `--lg-dock-tint` | `255 255 255` | `28 28 32` | Translucent capsule base RGB tint |
| `--lg-dock-opacity` | `0.58` | `0.9` | Frosted glass fill opacity (`::before` layer, default 50% intensity) |
| `--lg-dock-blur` | `8px` | `12px` | Chromium backdrop blur paired with SVG refraction |
| `--lg-dock-blur-fallback` | `14px` | `20px` | WebKit/Safari backdrop blur fallback |
| `--lg-dock-saturate` | `190%` | `180%` | Backdrop color saturation boost |
| `--lg-dock-border` | `255 255 255 / 0.85` | `255 255 255 / 0.1` | Outer floating capsule hairline rim |
| `--lg-dock-highlight` | `255 255 255 / 0.92` | `255 255 255 / 0.24` | Top specular refraction highlight |
| `--lg-dock-edge` | `0 0 0 / 0.1` | `255 255 255 / 0.08` | Inner perimeter glass edge bevel |
| `--lg-dock-shadow` | `0 12px 32px rgb(0 0 0 / 0.14)` | `0 16px 40px rgb(0 0 0 / 0.65)` | Floating dock elevation above safe area |

---

## 5. Governance & Migration Path

1. Define the CSS custom properties in `frontend/src/app/globals.css` (`:root` + `@media (prefers-color-scheme: dark)`).
2. Map all semantic color names and the `ios-*` font-size presets inside `frontend/tailwind.config.js`.
3. Update `scripts/verify-ui-directives.mjs` to flag any new raw hex literals or arbitrary `text-[...px]` classes inside `frontend/src/components/` when future Stitch screens are imported.
