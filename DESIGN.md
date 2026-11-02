---
name: CampusUNSA Mobile Design System
version: 1.0.0
tokens:
  colors:
    primary: "#8B0000"         # UNSA Institutional Crimson / Red
    primary-hover: "#6B0000"
    secondary: "#1B365D"       # UNSA Slate Navy Blue
    secondary-hover: "#132742"
    accent: "#D4AF37"          # UNSA Academic Gold
    background: "#F8FAFC"      # Clean Slate Background
    surface: "#FFFFFF"         # Card / Modal White
    text-main: "#0F172A"       # Primary Dark Slate Text
    text-muted: "#64748B"      # Subtitles and Metadata
    border: "#E2E8F0"          # Subtle Divider Gray
    status:
      urgent: "#DC2626"        # Deadline < 24 hours
      warning: "#F59E0B"       # Deadline 24 - 48 hours
      normal: "#10B981"        # Deadline > 48 hours
      classroom: "#0F9D58"     # Google Classroom Badge
      dutic: "#EA4335"         # Moodle DUTIC Badge
  typography:
    font-family: "Inter, system-ui, -apple-system, sans-serif"
    heading-1: "text-2xl font-bold tracking-tight text-[#0F172A]"
    heading-2: "text-lg font-semibold text-[#0F172A]"
    body-regular: "text-sm text-[#0F172A]"
    body-muted: "text-xs text-[#64748B]"
  radii:
    card: "rounded-xl"
    pill: "rounded-full"
    button: "rounded-lg"
  elevation:
    card: "shadow-sm border border-[#E2E8F0]"
    floating: "shadow-lg border border-[#E2E8F0]"
---

# CampusUNSA Mobile Interface Rules

## 1. Ergonomics and Mobile-First Constraints
- Target Viewport: 390px x 844px (Standard mobile viewport).
- Touch Targets: Minimum 48px x 48px for interactive elements.
- Navigation: Persistent bottom navigation bar with active state highlighted in #8B0000.
- Safe Areas: Top status bar padding (pt-4) and bottom safe area margin (pb-6).

## 2. Institutional Visual Hierarchy
- Headers: Crisp #1B365D or #8B0000 accents; never mix conflicting gradients.
- Course Cards: Card background #FFFFFF, rounded corners rounded-xl, subtle border border-[#E2E8F0].
- Task Urgency Indicator: Left border stripe (4px) with semantic urgency color:
  - Red (#DC2626): Expires in less than 24 hours.
  - Amber (#F59E0B): Expires in 24 to 48 hours.
  - Green (#10B981): Expires in more than 48 hours.
- Source Badges:
  - DUTIC: Pill badge with #EA4335 background at 10% opacity, text #EA4335.
  - Classroom: Pill badge with #0F9D58 background at 10% opacity, text #0F9D58.
