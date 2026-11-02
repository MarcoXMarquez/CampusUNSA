# CampusUNSA Mobile Design System Specification

## 1. Architectural Foundations and Visual Identity

The CampusUNSA Progressive Web Application (PWA) interface adheres to an institutional, high-density, accessible design language tailored for students and faculty of Universidad Nacional de San Agustín de Arequipa (UNSA).

### 1.1 Color Tokens
The color palette directly maps to the Tailwind configuration defined in `frontend/tailwind.config.ts`:

| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `unsa.red` (Primary) | `#8B0000` | Institutional header accents, primary call-to-actions, active navigation states. |
| `unsa.blue` (Secondary) | `#1B365D` | Deep slate secondary buttons, card headers, contrast dividers. |
| `unsa.gold` (Accent) | `#D4AF37` | Academic achievements, highlighted tags, badge borders. |
| `unsa.dark` (Main Text) | `#0F172A` | Primary typography, body text, high-contrast headings. |
| `unsa.light` (Background) | `#F8FAFC` | App viewport background, light gray utility surfaces. |
| Surface White | `#FFFFFF` | Interactive cards, modal drawers, form containers. |
| Border Slate | `#E2E8F0` | Structural dividers, container boundaries. |

### 1.2 Urgency and Source Badges
Academic deadlines require unambiguous visual cues:
- **Critical Urgency (< 24 Hours):** `#DC2626` (Red left indicator bar and text).
- **Moderate Urgency (24 - 48 Hours):** `#F59E0B` (Amber left indicator bar and text).
- **Normal Urgency (> 48 Hours):** `#10B981` (Emerald left indicator bar and text).
- **Google Classroom Source:** `#0F9D58` (Classroom green pill badge with 10% background tint).
- **DUTIC Moodle Source:** `#EA4335` (Moodle orange-red pill badge with 10% background tint).

---

## 2. Mobile Ergonomics and Constraints

1. **Target Viewport:** 390px x 844px (Standard modern mobile viewport).
2. **Touch Target Size:** Minimum 48px x 48px for all tap targets, buttons, and navigation icons.
3. **Bottom Navigation Bar:** Persistent bottom bar with 4 core views:
   - Hub (Courses and Deadlines)
   - Calendar (Synchronized iCal & Classroom schedule)
   - WhatsApp Assistant (Pairing & notification status)
   - Settings (Profile & institutional domain confirmation)
4. **Accessibility:** Conforms to WCAG 2.1 AA standards (minimum 4.5:1 text-to-background contrast ratio).

---

## 3. Directory and Mock Structure

- Machine-readable agent contract: `DESIGN.md` (root directory).
- Exported screens and visual artifacts: `docs/design/mocks/`.
- Production implementation: `frontend/src/components/`.
