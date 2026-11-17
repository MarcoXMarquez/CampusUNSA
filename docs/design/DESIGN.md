---
name: CampusUNSA Apple iOS 18 HIG Design System
version: 3.1.0
stitch_project_id: "4575327637306768444"
stitch_design_system_id: "b2254f7922514144afffe91677ad283f"
workflow: Stitch-First -> Apple iOS HIG Semantic Token Mapping -> Adaptive Light & Dark Components
guideline_ref: "docs/design/apple-ios-palette-guideline.md"
tokens:
  surfaces:
    canvas: "rgb(var(--bg-canvas)) -> Light #F2F2F7 | Dark #000000"
    surface-sheet: "rgb(var(--surface-sheet)) -> Light #FFFFFF | Dark #121214"
    surface-card: "rgb(var(--surface-card)) -> Light #FFFFFF | Dark #1C1C1E"
    surface-elevated: "rgb(var(--surface-elevated)) -> Light #E5E5EA | Dark #2C2C2E"
    surface-inset: "rgb(var(--surface-inset)) -> Light #E5E5EA | Dark #2C2C2E"
    surface-hero: "rgb(var(--surface-hero)) -> Light #FCEBEC | Dark #1D0F12"
    surface-urgent: "rgb(var(--surface-urgent)) -> Light #FDE8E8 | Dark #241717"
  borders:
    subtle: "rgb(var(--border-subtle)) -> Light #E5E5EA | Dark #2C2C2E"
    control: "rgb(var(--border-control)) -> Light #C7C7CC | Dark #3A3A3C"
    urgent-edge: "rgb(var(--border-urgent)) -> Light #F5C2C4 | Dark #4A1C21"
  ink:
    ink-primary: "rgb(var(--ink-primary)) -> Light #000000 | Dark #FFFFFF"
    ink-secondary: "rgb(var(--ink-secondary)) -> Light #606065 | Dark #AEAEB2"
    ink-muted: "rgb(var(--ink-muted)) -> Light #66666C | Dark #99999E"
    ink-disabled: "rgb(var(--ink-disabled)) -> Light #AEAEB2 | Dark #636366"
  brand:
    brand-cta: "rgb(var(--brand-cta)) -> Light #8B0000 | Dark #990000"
    brand-cta-hover: "rgb(var(--brand-cta-hover)) -> Light #A51C30 | Dark #B2182B"
    brand-action: "rgb(var(--brand-action)) -> Light #BA131A | Dark #F56B70"
    brand-tint: "rgb(var(--brand-tint)) -> Light #C72C41 | Dark #FF3B5C"
  status:
    status-urgent: "rgb(var(--status-urgent)) -> Light #BA0013 | Dark #FF453A"
    status-soon: "rgb(var(--status-soon)) -> Light #805000 | Dark #FFD60A"
    status-success: "rgb(var(--status-success)) -> Light #1F6F32 | Dark #30D158"
  typography:
    font-family: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", system-ui, sans-serif"
    scale: "text-ios-large-title (34px) .. text-ios-caption-2 (11px)"
  liquid_glass_dock:
    filter_id: "#campus-liquid-glass-dock"
    tint: "rgb(var(--lg-dock-tint) / var(--lg-dock-opacity)) -> Light 255 255 255 / 0.58 | Dark 28 28 32 / 0.9 (50% intensity default)"
    backdrop_chromium: "url(#campus-liquid-glass-dock) blur(var(--lg-dock-blur)) saturate(var(--lg-dock-saturate))"
    backdrop_webkit: "blur(var(--lg-dock-blur-fallback)) saturate(var(--lg-dock-saturate))"
---

# CampusUNSA Design System

## 1. Visual Authority & Apple HIG Token Architecture
- **Stitch Visual Project:** Google Stitch project `4575327637306768444` and design system `b2254f7922514144afffe91677ad283f` ("Academic iOS Design System") serve as the visual layout and proportion reference.
- **Canonical Palette & Typography Matrix:** All semantic colors, CSS RGB custom properties (`:root` + `@media (prefers-color-scheme: dark)`), legacy hex mappings, and the 11-tier SF Pro Dynamic Type scale are documented in [apple-ios-palette-guideline.md](apple-ios-palette-guideline.md) and rendered visually in [apple-ios-design-system-light.png](apple-ios-design-system-light.png) and [apple-ios-design-system-dark.png](apple-ios-design-system-dark.png).
- **Mandatory Mapping Workflow:**
  1. Design or inspect any screen in Google Stitch (`stitch_find` / `stitch_get`).
  2. Map every surface, text, border, accent, and text size to existing tokens in `frontend/src/app/globals.css` and `frontend/tailwind.config.js` instead of hardcoding hex literals or arbitrary `text-[...px]` classes inside `frontend/src/components/`.
  3. Export rasterized mascot illustrations as optimized Retina WebP assets (`< 30 KB`, under `frontend/public/images/onboarding/`) and vector logos as SVG.

## 2. Non-Negotiable Frontend Engineering Floor
- Strict TypeScript interfaces (`no any`) and centralized HTTP / environment access in `frontend/src/lib/api-client.ts`.
- Adaptive Light and Dark support across all views and modal sheets via semantic CSS variables (`bg-canvas`, `bg-surface-*`, `text-ink-*`, `border-subtle`).
- Zero raw hex color literals (`Rule-3.2.5`) and zero arbitrary pixel/rem font sizes (`Rule-3.2.6`) inside `frontend/src/components/`, enforced statically by `node scripts/verify-ui-directives.mjs`.
- Zero network web-font imports (`next/font/google`, `fonts.googleapis.com`) and zero fake mobile status bars (`9:41`).
- Mandatory functional states on data views: Loading, Empty, Offline, Expired Session, Sync Error, and Long Content truncation.
- Accessibility: semantic landmarks, `aria-label` / `aria-current`, 44px minimum touch targets, and WCAG AA contrast in both Light and Dark themes.

## 3. Surface Elevation and Material

Follow the [surface and elevation guideline](surface-elevation-guideline.md) when choosing boundaries, shadows, and interaction states. The floating dock uses a custom PWA glass effect inspired by iOS 26 Liquid Glass.
