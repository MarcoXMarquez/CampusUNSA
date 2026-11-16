# CampusUNSA Apple iOS Design System & Palette Guideline

## 1. Visual Reference Boards

This guideline establishes the canonical color tokens, surface hierarchy, and typography scale for `frontend/`, reconciling the Apple Human Interface Guidelines (iOS 18 HIG) semantic layering model with the UNSA institutional crimson identity (`#8B0000`) and all Stitch screens designed for CampusUNSA.

- **Interactive HTML Specimen (Light & Dark toggle):** [apple-ios-design-system.html](apple-ios-design-system.html)
- **Dark Mode Reference Board (OLED):** [apple-ios-design-system-dark.png](apple-ios-design-system-dark.png)
- **Light Mode Reference Board (iOS Grouped):** [apple-ios-design-system-light.png](apple-ios-design-system-light.png)

---

## 2. Why Apple HIG Semantic Layering Differs from Material 3

Google's Material 3 / Stitch Theme Builder (`Academic iOS Design System`) generates numeric tonal ramps (`surface-container-low`, `high`, `highest`, `primary-10..90`). By contrast, Apple's iOS Human Interface Guidelines define **adaptive semantic roles** across four vertical layers, rather than screen-specific hex variants:

1. **Canvas (`systemGroupedBackground`):** Root viewport (`#F2F2F7` light, `#000000` dark).
2. **Sheet (`surface-sheet`):** Modal drawer backdrop (`#F2F2F7` light, `#161618` dark).
3. **Grouped Card (`secondarySystemGroupedBackground`):** Inset grouped containers and rows (`#FFFFFF` light, `#1C1C1E` dark).
4. **Elevated Control (`tertiarySystemGroupedBackground`):** Inputs, quick-date pills, active segments, and inline pickers (`#F9F9FB` light, `#2C2C2E` dark).

---

## 3. Canonical Color Token Matrix & Legacy Consolidation

All ~80 scattered hex literals audited across `frontend/src` collapse into the 16 semantic tokens below:

| Semantic Token | Light Mode | Dark Mode | Semantic Usage | Legacy Hex Literals Replaced |
| :--- | :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#F2F2F7` | `#000000` | Root page background | `#000000`, `#f2f2f7` |
| `--surface-sheet` | `#F2F2F7` | `#161618` | Bottom sheets and modal overlays | `#121214`, `#141416`, `#161618`, `#17171a`, `#18181a` |
| `--surface-card` | `#FFFFFF` | `#1C1C1E` | Grouped cards, list groups, settings panels | `#1c1c1e`, `#161719`, `#1f1f23`, `#222225`, `#242426` |
| `--surface-elevated` | `#F9F9FB` | `#2C2C2E` | Inputs, search bars, chips, active segments | `#222226`, `#232326`, `#23252a`, `#242427`, `#252528`, `#26262b`, `#2c2c2e`, `#2c2c31`, `#2e2e33`, `#3a3a3e` |
| `--surface-inset` | `#E5E5EA` | `#19191B` | Segmented control tracks and recessed wells | `#18181b`, `#19191b`, `#d6d8db`, `#c8cbd1` |
| `--border-subtle` | `rgba(60,60,67,0.16)` | `#2A2A2E` | Inset dividers and card boundaries | `#232429`, `#2a2a2e`, `#2a2b2f`, `#2b2b30`, `#2d2f36`, `#323236`, `#e5e5ea` |
| `--border-control` | `rgba(60,60,67,0.28)` | `#38383A` | Sheet grabbers, inactive switches, control edges | `#38383a`, `#38383f`, `#3a3a3c`, `#444448` |
| `--ink-primary` | `#000000` | `#FFFFFF` | Headlines, task titles, primary inputs | `#000000`, `#111315`, `#ffffff`, `#dededf` |
| `--ink-secondary` | `#6E6E73` | `#8E8E93` | Course tags, metadata, inactive navigation tabs | `#8e8e93`, `#9a9aa0`, `#a0a0a5`, `#d1d1d6`, `neutral-300/400` |
| `--ink-muted` | `#71767E` | `#7C7C82` | Placeholders, footnote hints, captions | `#68686d`, `#71767e`, `#7c7c82`, `#7d828a`, `#5e5e63`, `neutral-500` |
| `--ink-disabled` | `rgba(60,60,67,0.32)` | `#55555A` | Past calendar dates and disabled labels | `#55555a`, `#a9adb5` |
| `--brand-cta` | `#8B0000` | `#8B0000` | Solid primary CTA pills, central `+` FAB, submit buttons | `#8b0000`, `#800000`, `#990000`, `#991b22`, `#ba131a` |
| `--brand-cta-hover` | `#A51C30` | `#A51C30` | Active/hover fill on primary CTA controls | `#a51c30`, `#9f1016`, `#b91c1c` |
| `--brand-action` | `#D32F2F` | `#EA4345` | Navbar text actions (`Cancel`, `Done`), active tab, switches, selected calendar circle | `#e23b3b`, `#ea4345`, `#d34545`, `#c72c41`, `#ff3b5c`, `#dc2626` |
| `--brand-tint` | `#B91C1C` | `#EB5353` | Eyebrow labels on hero cards and overdue timestamps | `#d85858`, `#eb5353`, `#e25050`, `#e5575b`, `#e05258`, `#ff6b72`, `#f87171` |
| `--surface-hero` / `--surface-urgent` | `#FDF2F2` / `#FEF2F2` | `#1D0F12` / `#241717` | Next-class hero card and overdue task container (`--border-urgent`: `#3E1F20`) | `#1d0f12`, `#1b080b`, `#2d1417`, `#4a1118`, `#241717`, `#3e1f20` |

### Domain Exceptions (Preserved Outside UI Semantic Tokens)

- **Course Identity Palette (`frontend/src/lib/schedule-calculator.ts`):** 7 deterministic dot colors distinguishing enrolled courses (`#3B82F6`, `#D946EF`, `#F59E0B`, `#10B981`, `#06B6D4`, `#F43F5E`, `#8B5CF6`).
- **Google Identity Brand (`frontend/src/components/AuthFlow.tsx`):** Official Google G glyph colors (`#4285F4`, `#34A853`, `#FBBC05`, `#EA4335`) and button chrome required by Google OAuth branding guidelines.

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
