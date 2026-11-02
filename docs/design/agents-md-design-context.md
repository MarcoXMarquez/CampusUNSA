# Context Brief: Incorporating iOS-Native Design Directives into AGENTS.md

## 1. Overview and Purpose

This document provides complete architectural and engineering context for Claude to formulate a structured proposal for updating `AGENTS.md` in the CampusUNSA repository.

The goal is to expand `AGENTS.md` with enforceable **Frontend Presentation and UI/UX Directives** so that any autonomous coding agent (Claude Code, Google Antigravity, Cursor, Codex) working on the Next.js PWA produces consistent, native-feeling, production-grade interfaces adhering to our **iOS-native design system (Konsta UI / Apple Reminders style)**, rather than generating generic, cluttered "AI-style" mockups.

---

## 2. Current State of AGENTS.md

The current `AGENTS.md` focuses primarily on:
- **Project Identity:** Offline-resilient academic hub for Universidad Nacional de San Agustín de Arequipa (UNSA) combining Next.js 14 PWA and WhatsApp Assistant (FastAPI + Evolution API).
- **Inviolable Rules:**
  1. Zero Emojis (strictly enforced across code, tests, docs, commits).
  2. Technical English Only in all repository artifacts.
  3. Security: `@unsa.edu.pe` Google OAuth domain gate, 300s OTP TTL in Redis.
  4. Test-Driven Development (TDD First, coverage >= 80%).
  5. Strict Type Safety (TypeScript without `any`, Python with Pydantic v2).
  6. Strict No-Force Git Policy.
- **Workflow & Quality Gates:** Conventional Commits, Squash Merges, Continuous Oppia-Caliber Wiki Gate (`campusunsa-wiki-orchestrator`), and Unified Verification Oracle (`./scripts/verify.sh`).

### The Problem
`AGENTS.md` lacked explicit rules for **frontend presentation, visual hierarchy, and component composition**. Consequently, when AI agents generated UI code, they fell back on default LLM aesthetic patterns:
- Floating cards with diffused box-shadows and colored vertical indicator stripes on every row.
- Inconsistent pills and badges scattered everywhere (source, date, status, filters).
- Cluttered dashboard metric widgets (e.g., Promedio / Cursos / Completadas) occupying critical mobile screen space.
- Manual fake status bars (hour, battery, WiFi drawn in HTML/CSS).
- Inconsistent color semantics (crimson used for headers and branding instead of interactive tint; red mixed up between brand identity and deadline urgency).

---

## 3. The New iOS-Native Design Standard (Issue #88 / PR #89)

We redesigned the frontend layer to feel like a **native iOS application**, taking **Apple Reminders** as the primary design reference (with secondary inspiration from Things 3 and Apple Health).

### 3.1 Technology Stack (Frontend)
- **Framework:** Next.js 14.1.4 (App Router) + React 18.2.0 + TypeScript 5.4.
- **Mobile Component Library:** Konsta UI v4 (`konsta/react`, wrapped via `konstaConfig` in `tailwind.config.js`).
- **Icons:** `@phosphor-icons/react` (single icon family, regular weight, no colored box wrappers).
- **Date & Calendar Utility:** `date-fns` v4 with Spanish locale (`es`).
- **Styling:** Tailwind CSS v3.4 with custom iOS color palette and system font stack.

### 3.2 Inviolable Design Directives

#### Directive 1: Anti-AI UI Generation Rules (Strict Prohibitions)
- **Zero Floating Shadow Cards:** Do not use cards with `shadow-md`, `shadow-lg`, or arbitrary left colored borders. Grouped items must strictly use inset lists (`<List strong inset>`).
- **Zero Pill Clutter:** Do not place multi-colored badges on every row. Source attribution (Moodle vs. Classroom) must use an 8px circular dot or subtle secondary text (`Moodle · Grupo B`).
- **Zero Dashboard Metrics on Task Feeds:** Do not render summary metric rows (Average, Course Count, Completion Percentage) on mobile task list screens. A single concise subtitle under the large title (e.g., "2 entregas pendientes") is sufficient.
- **Zero Fake Status Bars:** Never draw a custom status bar (time, battery, signal icons). Hardware status bars are handled by iOS/Android; layout containers must use `safeAreas` and `viewportFit: "cover"`.
- **Zero Fragmented Per-Card Action Buttons:** Avoid placing separate action buttons on each list row. Each row is an atomic tap target with a chevron that opens a dedicated detail sheet (`TaskDetailSheet`).
- **No Unverifiable File Upload Promises:** In assignment detail sheets, replace speculative file upload buttons with verified deep links ("Abrir en Moodle", "Abrir en Classroom").

#### Directive 2: Color Semantics and Design Tokens
| Role | Light Mode Hex | Dark Mode Hex | Semantic Rule |
| :--- | :--- | :--- | :--- |
| **Grouped Background** | `#F2F2F7` | `#000000` | Full-screen container background. |
| **Surfaces / Inset Cells** | `#FFFFFF` | `#1C1C1E` | List item background. |
| **Hairline Dividers** | `rgba(60,60,67,0.29)` | `rgba(84,84,88,0.65)` | Inset list item separators. |
| **Primary Typography** | `#000000` | `#FFFFFF` | Headlines, titles, active labels. |
| **Secondary Typography** | `rgba(60,60,67,0.6)` | `rgba(235,235,245,0.6)` | Subtitles, course metadata, relative timestamps. |
| **App Tint (`primary`)** | `#8B0000` (Guinda UNSA) | `#E5575B` (Light Tint) | **Interactive tint only** (buttons, active tabs, focus rings). Never use as a solid background on large headers. |
| **Urgent Deadline (`urgent`)** | `#FF3B30` (Apple Red) | `#FF453A` (iOS Red) | **Reserved strictly for deadlines due in < 24 hours**. Never use for branding or origin markers. |

#### Directive 3: System Typography (Apple iOS Scale)
- **Font Stack:** Must use the native Apple system font stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif`). Do not import Google Fonts like Inter or Roboto.
- **Scale Hierarchy:**
  - Large Title: 34px / bold
  - Section Title (`BlockTitle`): 22px / semibold
  - Headline (row title): 17px / semibold
  - Body: 17px / regular
  - Subheadline (row subtitle): 15px / regular, secondary color
  - Footnote: 13px / regular, secondary color

#### Directive 4: Global Navigation Architecture
- **Tab Limit:** Maximum 3 to 4 tabs. Standard structure: `Hoy`, `Calendario`, `Ajustes`.
- **Tab Bar Styling:** Translucent bottom navigation with background blur (`backdrop-blur-md`), fine outline border, Phosphor icons, and persistent text labels.
- **WhatsApp Channel Location:** WhatsApp must **never** be a top-level tab. It lives inside `Ajustes` as a service row ("Asistente de WhatsApp") that presents the modal pairing sheet.

#### Directive 5: Form, Authentication, and Modal Patterns
- **Google Sign-In Button:** Must follow official Google Identity specifications (white or neutral dark surface, subtle border `#dadce0`, official colored 'G' logo on left, neutral text "Continuar con Google"). No crimson borders or colored backgrounds.
- **Manual Credentials:** Text link "Usar C.I. y contraseña UNSA" navigating to an input list. No accordions.
- **WhatsApp Pairing Sheet (`Sheet`):**
  - Top grabber handle and iOS navigation bar ("Cancelar" on left, centered title). No circular X button.
  - 6-digit input with `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, and auto-submission on 6th digit.
  - Expiration time displayed **once** in footnote text ("El código expira en 04:59"). No duplicate circular progress rings.
  - Formatted bot number (`+51 954 123 456`) with direct deep link.

#### Directive 6: Mandatory UI States
Every view must implement and handle 6 standard states:
1. **Loading:** Row-shaped skeletons (never a full-screen blocking spinner).
2. **Empty:** Centered secondary text (e.g., *"Nada pendiente. Disfruta tu día."*).
3. **Offline:** Non-blocking top banner (*"Sin conexión · mostrando datos guardados"*), preserving cached data from `localStorage`.
4. **Expired Session:** Inline actionable banner (*"Sesión de Moodle vencida · Reconectar"*) without disabling Google Classroom.
5. **Sync Error:** Concise banner with *"Reintentar"* action.
6. **Long Content:** Systematic line clamping (`line-clamp-2` for headlines, ellipsis truncation).

---

## 4. Request for Claude

Please review this context and the existing `AGENTS.md` repository rules. Recommend how to update `AGENTS.md` to formally encode these frontend design directives.

Specifically, provide:
1. **Structural Recommendation:** Where and how should these rules be integrated (e.g., a new section `3.2 Frontend & UI/UX Presentation Directives` under `Inviolable Constraints`, or a dedicated chapter)?
2. **Precise Draft Markdown:** The exact English text to add to `AGENTS.md`, preserving the established tone, formatting, and zero-emoji compliance.
3. **Checklist & Verification Gate Integration:** How the verification oracle (`verify.sh`) or PR hygiene gates should validate these design directives.
