# Context and Problem Statement: DUTIC Moodle (Aula Virtual UNSA) Integration

## Document Identifier: CONTEXT-DUTIC-MOODLE-2026-V1.0
## Project: CampusUNSA
## Target Audience: System Architects, Engineers, and AI Assistants (Claude)

---

## 1. System Overview & Core Purpose of CampusUNSA

CampusUNSA is a centralized, offline-resilient academic hub engineered for the university community of Universidad Nacional de San Agustin de Arequipa (UNSA). 

The platform architecture consists of:
* **Frontend Web Application:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, and Progressive Web App (PWA) service workers with client-side caching.
* **Backend Core Services:** Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2, PostgreSQL 16, and Redis 7.
* **Conversational Assistant:** Omnichannel WhatsApp bot coordinated with Evolution API (Baileys) and FastAPI webhook handlers.

### 1.1 The Core Mission
Students at UNSA must track homework, laboratory submissions, and academic evaluations across multiple disconnected platforms. Missing a deadline directly affects course completion. 

CampusUNSA solves this by consolidating academic deadlines into a single, unified Academic Task Board. To achieve this, the platform needs to ingest data from two primary learning systems:
1. **Google Classroom:** Used by several academic departments. (Status: Solved via automated Google OAuth 2.0 Authorization Code flow and Google Classroom REST API).
2. **DUTIC Aula Virtual (Moodle):** The official university learning management system (`aulavirtual.unsa.edu.pe`), where official course enrollments, laboratory guides, quizzes, and university assignment submissions are published.

---

## 2. The Core Problem & Institutional Obstacles

Unlike Google Classroom, which provides standardized public REST APIs, OAuth 2.0 scopes, and developer documentation, extracting student academic tasks from UNSA's Virtual Classroom (DUTIC Moodle) faces significant institutional and technical roadblocks.

### 2.1 Closed Institutional Environment & Zero Official Student APIs
* The Virtual Classroom is hosted and managed by the university's IT office (Direccion Universitaria de Tecnologias de la Informacion y Comunicacion - DUTIC).
* **Moodle Web Services API is strictly restricted:** While Moodle natively supports a Web Services REST API (`/webservice/rest/server.php`), UNSA has disabled student-facing API token generation. Only administrative accounts configured by university IT staff can generate web service tokens.
* There is no public developer portal, no OAuth client registration, and no sanctioned API for students or third-party campus developers.

### 2.2 Perimeter Security, Firewall, and CORS Blocking
* The domain `aulavirtual.unsa.edu.pe` (and its active semester endpoints such as `https://aulavirtual.unsa.edu.pe/2026B`) is protected by institutional web application firewalls (WAF) and perimeter access controls.
* **CORS (Cross-Origin Resource Sharing) is blocked:** The Moodle web server does not send `Access-Control-Allow-Origin` headers for third-party origins. Therefore, code running in the student's browser on the CampusUNSA domain (`http://localhost:3000` or production) cannot directly make `fetch()` or `XMLHttpRequest` calls to `aulavirtual.unsa.edu.pe`.

### 2.3 Cookie Security & SameSite / HttpOnly Isolation
* Moodle authenticates web users through a session cookie named `MoodleSession`.
* The `MoodleSession` cookie is flagged with `HttpOnly` and scoped strictly to the domain `aulavirtual.unsa.edu.pe`.
* Client-side JavaScript running on any domain other than `aulavirtual.unsa.edu.pe` cannot access or inspect `MoodleSession` via `document.cookie`.

### 2.4 Internal Authentication Mechanism (Google SSO Bridge)
* UNSA students log into DUTIC by clicking an institutional Google Workspace button (`https://aulavirtual.unsa.edu.pe/auth/oauth2/login.php?id=1`).
* Google verifies the institutional account (`@unsa.edu.pe`) and redirects the user back to Moodle.
* Once inside, Moodle generates two critical session identifiers:
  1. **`MoodleSession`:** The session cookie sent in HTTP headers for state validation.
  2. **`sesskey`:** A dynamic CSRF validation token generated per session, embedded in the page JavaScript object `M.cfg.sesskey`. Every internal AJAX request to Moodle requires this exact `sesskey` parameter.

Because external access is blocked and no official student API exists, regular API integrations cannot be used.

---

## 3. The Current Solution (Manual Workaround)

To prove feasibility and extract real student assignments into the PostgreSQL database, the engineering team reverse-engineered Moodle's internal AJAX endpoints (based on patterns observed in `JOSETRA44/DUTIC-mcp`).

Currently, the extraction functions through the following manual developer workaround:

### Step 1: Manual Browser Login
The student opens Google Chrome, Firefox, or Edge on a desktop computer, navigates to `https://aulavirtual.unsa.edu.pe`, and logs in using their `@unsa.edu.pe` Google Workspace account.

### Step 2: Developer Tools & Console Execution
Once on the student dashboard (`https://aulavirtual.unsa.edu.pe/my` or `/2026B/my`), the student opens the browser Developer Tools (`F12` or `Ctrl+Shift+I`), navigates to the **Console** tab, and executes:

```javascript
console.log("sesskey:", M.cfg.sesskey);
```

The console outputs a 10-character alphanumeric string (e.g., `a1B2c3D4e5`). The student copies this value.

### Step 3: Cookie Extraction
In the same Developer Tools window, the student navigates to:
* **Application** (Chrome/Edge) or **Storage** (Firefox) tab.
* Expands **Cookies** in the sidebar.
* Selects `https://aulavirtual.unsa.edu.pe`.
* Finds the cookie named `MoodleSession`.
* Copies its raw string value (e.g., `f7a8b9c0d1e2...`).

### Step 4: Submission to CampusUNSA
The student opens the CampusUNSA web app, navigates to the **DUTIC Moodle Synchronization** tab, pastes both the `MoodleSession` cookie and the `sesskey`, and clicks **"Sincronizar DUTIC"**.

### Step 5: Backend Ingestion
The CampusUNSA FastAPI backend (`app/services/dutic_sync.py`) receives both tokens and executes backend-to-Moodle HTTP POST requests via Python `httpx`, mimicking an active browser session:

* **Endpoint:**
  `POST https://aulavirtual.unsa.edu.pe/2026B/lib/ajax/service.php?sesskey={sesskey}`
* **Headers:**
  ```http
  Cookie: MoodleSession={moodle_session}
  Content-Type: application/json
  Origin: https://aulavirtual.unsa.edu.pe
  User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36
  ```
* **Payload:**
  A batch JSON array executing internal Moodle service methods:
  * `core_course_get_enrolled_courses_by_timeline_classification`: Fetches enrolled courses for the active semester.
  * `core_calendar_get_action_events_by_timesort`: Fetches upcoming timeline events and pending assignments.
  * Course module sweeps (`mod_assign`): Detects hidden assignments that professors posted inside weekly topic sections without registering them on the global calendar.

* **Database Persistence:**
  The backend parses the JSON response and performs idempotent upsert operations into PostgreSQL tables (`classroom_courses` and `classroom_assignments`) with `origin='moodle'`.

---

## 4. Why the Current Solution is Problematic

While the current mechanism successfully extracts real courses and assignments into PostgreSQL, it presents severe usability and operational limitations:

1. **Unacceptable Student UX:** Non-technical university students cannot be expected to open browser developer tools, execute JavaScript commands in the console, and copy cookies.
2. **Incompatible with Mobile Devices:** The platform aims to be a Progressive Web App (PWA) and mobile WhatsApp assistant. Mobile browsers (Chrome for Android, Safari for iOS) do not offer developer tools or console access to copy cookies.
3. **Short Session Lifetimes:** `MoodleSession` cookies expire after a few hours of inactivity. As soon as the cookie expires, Moodle returns `requireloginerror` or redirects to login HTML, forcing the student to re-extract credentials manually.
4. **Security Concerns:** Asking users to copy and paste session cookies manually creates bad security habits and risks exposing session credentials.

---

## 5. Scope for Claude: Objective of Brainstorming

The objective of providing this document to Claude is to analyze these technical and institutional constraints and brainstorm possible solutions or alternative architectural patterns.

### Constraints to Keep in Mind:
* UNSA IT administration will not grant student API keys or enable third-party OAuth on the Moodle server.
* The browser security sandbox (CORS, SameSite, HttpOnly) prevents third-party client web apps from reading Moodle's cookies directly.
* The solution should ideally allow regular university students (including mobile users) to synchronize their tasks without needing developer tools or manual cookie copying.

*(Note: In accordance with project instructions, no specific solutions are proposed in this document. Only the current problem, context, and existing workaround are detailed.)*
