# CampusUNSA iOS Design System Specification

## 1. Overview and Core Philosophy

CampusUNSA uses an iOS-native presentation layer modeled after Apple Reminders, with secondary inspiration from Things 3 and Apple Health. The objective is to provide a clean, distraction-free academic hub for students and faculty of Universidad Nacional de San Agustín de Arequipa (UNSA), eliminating generic AI-generated interface tropes (floating shadow cards, excessive multi-colored pills, artificial dashboard metric rows, and fake status bars).

This document details the visual tokens, component behaviors, and UI contracts governing all frontend code in `frontend/`.

---

## 2. Technical Stack and Configuration

* **Framework:** Next.js 14 (App Router), React 18, TypeScript (strict mode, no `any`).
* **Component Library:** Konsta UI v4 (`konsta/react`) initialized with `theme="ios"`.
* **Tailwind Integration:** Configured via `konstaConfig` wrapper in `tailwind.config.js`.
* **Iconography:** Phosphor Icons (`@phosphor-icons/react`), regular weight, rendered cleanly without colored background enclosures.
* **Localization:** Interface copy in Peruvian Spanish (`es-PE`), dates formatted via `date-fns` with `es` locale.
* **Typography:** Pure system font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif`. Web font imports (Google Fonts, Inter, Roboto) are strictly prohibited.

---

## 3. Design Tokens and Color Semantics

Colors are resolved strictly through semantic tokens. Off-palette hex literals in component files are prohibited.

| Token Role | Light Mode | Dark Mode | Semantic Invariant |
| :--- | :--- | :--- | :--- |
| Grouped Background | `#F2F2F7` | `#000000` | Full-screen container background |
| Surfaces / Inset Cells | `#FFFFFF` | `#1C1C1E` | List item and card surface background |
| Hairline Dividers | `rgba(60,60,67,0.29)` | `rgba(84,84,88,0.65)` | Inset list item separators |
| Primary Text | `#000000` | `#FFFFFF` | Titles, section headlines, primary values |
| Secondary Text | `rgba(60,60,67,0.6)` | `rgba(235,235,245,0.6)` | Metadata, timestamps, course tags |
| App Tint (`primary`) | `#8B0000` | `#E5575B` | Interactive elements only (buttons, tabs, focus) |
| Urgent Accent (`urgent`) | `#FF3B30` | `#FF453A` | Reserved strictly for deadlines under 24 hours |

Both light and dark themes are fully supported and adapt to system preferences automatically.

---

## 4. Typography Scale

| Style | Size | Weight | Color / Role |
| :--- | :--- | :--- | :--- |
| Large Title | 34px | Bold | View header |
| Section Title (`BlockTitle`) | 22px | Semibold | Grouped section header |
| Headline | 17px | Semibold | Task or list item title |
| Body | 17px | Regular | Informational and descriptive body text |
| Subheadline | 15px | Regular | Secondary metadata (due dates, source tags) |
| Footnote | 13px | Regular | Timers, legal disclaimers, input hints |

---

## 5. Navigation and Layout Architecture

1. **Tab Structure:** Standard bottom navigation bar with 3 core tabs:
   - `Hoy`: Immediate deadlines, grouped by urgency and course.
   - `Calendario`: Month and day agenda synchronized with institutional calendars.
   - `Ajustes`: Profile, Moodle re-authentication, and WhatsApp Assistant pairing.
2. **Tab Bar Appearance:** Translucent with background blur (`backdrop-blur-md`), Phosphor regular icons, and persistent text labels.
3. **WhatsApp Placement:** WhatsApp is never a root tab. It is presented in `Ajustes` as a service item ("Asistente de WhatsApp") that opens a dedicated modal pairing sheet.
4. **Header Style:** Standard iOS large collapsing navigation bar.

---

## 6. Prohibited Visual Patterns

1. **No Floating Cards with Heavy Shadows:** Avoid `shadow-md`, `shadow-lg`, or heavier drop shadows. Use Konsta inset lists (`<List strong inset>`).
2. **No Multi-Colored Badge Clutter:** Do not render multiple colored pills per row. Source attribution uses an 8px indicator dot or subtle secondary text (e.g. `Moodle · Grupo B`).
3. **No Metric Summary Dashboards:** Do not place metric cards (averages, counts, percentages) above the task stream on mobile.
4. **No Fake Status Bars:** Never render simulated battery, clock, or cellular signal bars. The container utilizes Konsta `safeAreas` and `viewportFit="cover"`.
5. **No Per-Row Action Buttons:** List rows act as unified tap targets opening `TaskDetailSheet`.
6. **No Unverifiable File Uploads:** Use direct links to Moodle or Classroom for submissions rather than mock upload inputs.

---

## 7. Authentication and Pairing Sheets

* **iOS 18 Onboarding and Authentication Flow:**
  * **Screen 1 (Onboarding Carousel — 4 Steps):** Four-step illustrated progression starring the official CampusUNSA mascot (student penguin with headphones and backpack). Clean two-tone curved card header (`#E5E5EA` on `#000000` chassis), optimized local Retina WebP illustrations (`560x560px`, `<30KB`), interactive 4-dot indicator, and full-width crimson action button ("SIGUIENTE" for steps 1–3, "COMENZAR" on step 4).
  * **Screen 2 (SignInScreen / SignUpScreen — Reference Card):** Native iOS navigation bar with back action ("Atrás"), top grabber pill, centered minimalist SVG mascot logo (`penguin-logo-minimal.svg`), dynamic greeting ("¡Bienvenido de nuevo!" / "Crea tu cuenta agustina"), rounded input fields (`rounded-[14px]`) for institutional email (`@unsa.edu.pe`) and password with visibility toggle, "Recordarme" checkbox, crimson primary submit button, subtle divider ("O continúa con"), official Google Identity button, and classic interactive footer toggle between Sign In and Sign Up.
* **Google OAuth Button:** Compliant with Google Identity guidelines (neutral surface, subtle `#DADCE0` border, official colored Google logo, neutral text).
* **Institutional Domain Restriction:** Authentication credentials and Google OAuth tokens are strictly restricted to verified `@unsa.edu.pe` institutional accounts.
* **WhatsApp Pairing Sheet:**
  * Top grabber and iOS navigation bar ("Cancelar" button, centered title).
  * 6-digit numeric input with `inputMode="numeric"`, `autoComplete="one-time-code"`, and auto-submission on the sixth digit.
  * Single footnote timer derived from server Redis TTL (300 seconds). No circular rings or duplicate timers.
  * Formatted phone number (`+51 954 123 456`) with direct WhatsApp deep link.

---

## 8. Mandatory UI States

All data views must implement and verify the following 6 states:
1. **Loading:** Row-shaped skeleton placeholders.
2. **Empty:** Centered secondary text (e.g., "Nada pendiente. Disfruta tu día.").
3. **Offline:** Non-blocking top warning banner preserving cached data.
4. **Expired Session:** Inline actionable banner ("Sesión de Moodle vencida · Reconectar").
5. **Sync Error:** Banner with retry button ("Reintentar") without wiping existing data.
6. **Long Content:** Truncation with `line-clamp-2` for headlines and ellipsis for secondary text.

---

## 9. Quality Verification Gate

The static verification script enforces these rules on every build and CI run:

```bash
node scripts/verify-ui-directives.mjs
```

Opt-outs for legitimate exceptions must use trailing comments:
```typescript
// ui-gate-ignore: <reason>
```
