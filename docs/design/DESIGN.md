---
name: CampusUNSA Stitch-First Design System
version: 2.0.0
stitch_project_id: "4575327637306768444"
workflow: Stitch-First (Stitch MCP -> Next.js Components)
tokens:
  colors:
    chassis-dark: "#000000"        # Pure black OLED chassis container
    onboarding-arc: "#E5E5EA"      # Curved onboarding header surface
    card-showcase-bg: "#0D0F17"    # Mascot illustration showcase frame
    card-surface-light: "#D6D8DB"  # Reference authentication card surface (light)
    card-surface-dark: "#1C1C1E"   # Reference authentication card surface (dark)
    input-surface-light: "#C8CBD1" # Rounded input background (light)
    input-surface-dark: "#2C2C2E"  # Rounded input background (dark)
    primary-unsa: "#920C12"        # Institutional crimson primary accent (Stitch)
    primary-action: "#BA131A"      # Crimson submit and focus ring accent
    primary-hover: "#9F1016"       # Crimson button hover accent
    primary-cta: "#990000"         # Onboarding primary button fill
    primary-cta-hover: "#800000"   # Onboarding primary button hover
    primary-base: "#8B0000"        # Core UNSA tint
    primary-dark-mode: "#E5575B"   # High-contrast tint on dark surfaces
    google-border: "#DADCE0"       # Official Google Identity outline
    text-heading-light: "#111315"  # Primary heading on silver surface
    text-body-light: "#1F2429"     # Labels and body text on silver surface
    text-muted-light: "#71767E"    # Secondary subtitles on silver surface
    text-placeholder: "#7D828A"    # Input placeholder text
  typography:
    font-family: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"SF Pro Display\", system-ui, sans-serif"
  radii:
    card-shell: "rounded-[38px]"
    showcase: "rounded-[32px]"
    input: "rounded-[14px]"
    button: "rounded-2xl"
  elevation:
    shell: "shadow-2xl"
    cta: "shadow-lg"
    card-inset: "shadow-inner"
    button-subtle: "shadow-sm"
---

# CampusUNSA Stitch-First Design System

## 1. Visual Authority (Stitch-First Workflow)
- Google Stitch project `4575327637306768444` is the authoritative visual source of truth for layout, surfaces, elevation shadows, border radii, and institutional color palette.
- Implementing a designed view follows a deterministic flow:
  1. Design or refine the screen in Google Stitch (`stitch_find` / `stitch_get`).
  2. Export rasterized mascot illustrations as optimized local Retina WebP assets (`< 30 KB`, e.g., `frontend/public/images/onboarding/`) and vector logos/marks as SVG.
  3. Build the Next.js component reproducing the Stitch design 1:1 while connecting strictly through `frontend/src/lib/api-client.ts` and `frontend/src/types/api.ts`.

## 2. Non-Negotiable Frontend Engineering Floor
- Strict TypeScript interfaces (`no any`) and centralized HTTP / environment access in `frontend/src/lib/api-client.ts` (never read `process.env.NEXT_PUBLIC_*` inside `frontend/src/components/`).
- No network web-font imports (`next/font/google`, `fonts.googleapis.com`) to preserve offline-first PWA resilience.
- No fake mobile status bar chrome (`9:41`, simulated battery/signal graphics).
- Mandatory functional states on data views: Loading, Empty, Offline, Expired Session, Sync Error, and Long Content truncation.
- Accessibility: semantic landmarks, `aria-label` / `aria-current` attributes, password visibility toggles, and dark mode support.
