# CampusUNSA: Software Requirements Specification (SRS)

## Document Identifier: SRS-CAMPUSUNSA-2026-V1.0
### System: Progressive Web Application & Academic Hub for Universidad Nacional de San Agustín (UNSA)
### Document Status: Approved Baseline (Sprint Planning Phase)

---

## 1. Executive Summary and Scope Baseline

CampusUNSA is a unified, offline-resilient Progressive Web Application (PWA) and conversational assistant designed to mitigate academic dispersion and administrative friction across the three geographical campuses of Universidad Nacional de San Agustín (Ingenierías, Biomédicas, and Sociales).

Following stakeholder interviews and architectural feasibility analysis, this document establishes the formal functional baseline for Release v1.0 (9-Sprint lifecycle concluding in December 2026). Requirements are partitioned into three formal categories:
1. **Core Functional Requirements (In-Scope v1.0):** Mandatory capabilities delivered across Sprints 1 through 7 and Sprint 9.
2. **Conditional Candidate Extensions (Should-Have Scope):** Pre-specified candidate capabilities staged for Sprint 8 subject to team velocity.
3. **Excluded Capabilities & System Boundaries (Out-of-Scope v1.0):** Formally deferred capabilities preserved in the architectural backlog for v2.0 roadmap consideration.

---

## 2. Core Functional Requirements (In-Scope v1.0 Baseline)

| Requirement ID | Functional Domain | Requirement Title | Technical & Functional Specification | Primary Enabler | Acceptance & Verification Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-01** | Identity & Access | Institutional Google OAuth Login | Mandatory single sign-on restricted strictly to `@unsa.edu.pe` hosted domain accounts. Rejects all external Google domains with HTTP 403 Forbidden. | FastAPI Google OAuth2 Client | Pytest unit tests verifying token claim extraction and domain validation regex. |
| **REQ-02** | Identity & Access | Unified Student Profile | Persistence and querying of University Student Code (CUI), full legal name, academic school, and assigned campus. | PostgreSQL `users` and `profiles` tables | Database schema constraint tests and profile retrieval endpoints. |
| **REQ-03** | Identity & Access | Role-Based Access Control (RBAC) | Strict permission gates separating roles: `student`, `secretary`, and `admin`. Blocks students from accessing staff queues. | FastAPI Security dependencies & JWT claims | Pytest security matrix asserting 403 Forbidden across all unauthorized combinations. |
| **REQ-06** | Platform & Resiliency | Offline Operational Resilience | Immediate dashboard and schedule access in under 500 ms without internet connectivity using Service Worker caching and IndexedDB storage. | `next-pwa` Service Worker & CacheStorage | Playwright automated offline emulation tests with network throttling disconnected. |
| **REQ-08** | Academic Hub | Google Classroom Synchronization | Automated background ingestion of active enrolled courses, coursework, assignments, and due dates via Google Classroom REST API. | Google Classroom API connector & Redis worker | Unit tests with mock Classroom responses covering rate limits and token refresh. |
| **REQ-09** | Academic Hub | Urgency-Coded Task Board | Dynamic kanban/list board grouping assignments with automated color-coded indicators: Red (<24h), Yellow (24h-72h), Green (>72h). | Next.js dynamic task board component | Vitest tests for time-window calculations against simulated UTC deadlines. |
| **REQ-10** | Academic Hub | Dynamic Weekly Class Schedule | Interactive weekly matrix displaying course hours, assigned lecture halls, and pavilion names across campus facilities. | Next.js Schedule Grid component | End-to-end rendering verification against mock student enrollment datasets. |
| **REQ-11** | Academic Hub | "Next Class" Countdown Widget | Real-time calculation computing remaining minutes, classroom code, and pavilion location for the student's next scheduled session. | Domain `ScheduleCalculator` engine | Pure unit tests covering midday transitions, overlapping slots, and weekend boundaries. |
| **REQ-13** | WhatsApp Messaging | Evolution API Inbound Webhook | Self-hosted Evolution API gateway receiving incoming WhatsApp message events with sub-second acknowledgment. | Evolution API Docker container & FastAPI webhook | Mock webhook event ingestion tests verifying signature headers and fast ACK. |
| **REQ-14** | WhatsApp Messaging | Natural Language Task Parsing | Structured LLM extraction (Gemini Flash / Ollama) parsing informal Spanish text into strict JSON: `{title, course, due_date}`. | LLM structured output schema & Pydantic validator | TDD suite with 20 real student message variations (abbreviations, slang, missing dates). |
| **REQ-15** | WhatsApp Messaging | Automated Board Scheduling | Instant persistence of NLP-parsed tasks directly into the student's academic task board, accompanied by WhatsApp confirmation dispatch. | Asynchronous Celery/Redis task dispatcher | End-to-end integration test verifying database insertion and outbound API mock call. |
| **REQ-16** | WhatsApp Messaging | 5-Minute OTP Phone Binding | Cryptographic 6-digit verification code with 300-second Redis TTL to bind a physical WhatsApp number to a verified student CUI. | Redis key expiration with TTL listener | Unit tests asserting expiration at 301 seconds and rejection of reused OTP tokens. |
| **REQ-19** | Student Guidance | Secretarial Handoff & Ticketing | Formal escalation workflow generating an auditable ticket (status: `OPEN`, `IN_REVIEW`, `RESOLVED`) when student queries cannot be automated. | PostgreSQL `tickets` schema & REST endpoints | State-machine transition tests ensuring valid lifecycle steps and audit logs. |
| **REQ-20** | Student Guidance | Interactive Bureaucracy Guide | Step-by-step interactive navigation for administrative procedures (enrollment, course drop, credit transfer) detailing forms and deadlines. | JSON-driven flowchart component | Component testing verifying dynamic step progression and prerequisite rendering. |
| **REQ-37** | Architecture & UI | Universal Responsive PWA | Mobile-first progressive web application fully functional and responsive on screens >= 360 px width across Android and iOS browsers. | Next.js 14 App Router & Tailwind CSS | Automated Playwright viewport audits at 360px, 390px, 768px, and 1280px widths. |
| **REQ-38** | DevOps & Platform | Reproducible Docker Environment | Single-command local runtime (`docker compose up`) orchestrating Next.js, FastAPI, PostgreSQL, Redis, and Nginx under uniform networks. | Multi-stage Dockerfiles & Docker Compose | GitHub Actions CI workflow executing test suite inside containerized environment. |

---

## 3. Conditional Functional Requirements (Candidate Backlog - Sprint 8 Scope)

These capabilities have passed architectural design and remain staged for implementation during Sprint 8, conditioned on team velocity and stable completion of Core Sprints 1 through 7:

| Requirement ID | Functional Domain | Requirement Title | Technical & Functional Specification | Staging Condition |
| :--- | :--- | :--- | :--- | :--- |
| **REQ-12** | Academic Hub | iCal Calendar Feed Export | Generation of dynamic `.ics` subscription endpoints for synchronizing class schedules into Google Calendar and Apple Calendar. | Staged for Sprint 8 if REQ-10 schedule schema is finalized ahead of schedule. |
| **REQ-17** | Knowledge Base | Official Regulations CMS | Administrative interface allowing faculty secretaries to upload and categorize PDF resolutions and academic regulations. | Staged for Sprint 8 as the administrative ingestion tier for REQ-18. |
| **REQ-18** | Knowledge Base | Regulatory RAG Query Engine | Retrieval-Augmented Generation engine using vector embeddings and strict citation enforcement (exact resolution and article number). | Staged for Sprint 8 if embedding inference latency remains < 1.5 seconds on local host. |
| **REQ-25** | Social / Security | Weighted Spam Prevention | Statistical reputation scoring adjusting weighting of student reports based on verified campus activity history. | Staged for Sprint 8 as an algorithmic refinement layer. |
| **REQ-26** | Campus GIS | Interactive 3-Campus Vector Map | Leaflet.js / OpenStreetMap viewer rendering Ingenierías, Biomédicas, and Sociales boundaries. | Staged for Sprint 8 as a visual locator utility. |
| **REQ-28** | Campus GIS | Facility & Classroom Search | Autocomplete search bar finding specific pavilions, laboratories, and lecture rooms by alphanumeric room codes. | Staged for Sprint 8 alongside REQ-26 map component. |
| **REQ-29** | Campus GIS | Pedestrian Walking Routes | Internal routing graph calculating walking paths between campus entrance gates and target pavilion entrances. | Staged for Sprint 8 if OSM campus pedestrian ways are verified. |
| **REQ-30** | Community Hub | Lost & Found Community Board | Public catalog of lost belongings displaying item photograph, date, campus, and generic description. | Staged for Sprint 8 as an auxiliary student social feature. |
| **REQ-31** | Community Hub | Mobile Camera Photo Reporting | Quick upload form utilizing HTML5 device camera capture with automated server-side image compression. | Staged for Sprint 8 accompanying REQ-30. |
| **REQ-32** | Community Hub | Verified Ownership Claim Channel | Private cryptographic or moderated messaging channel connecting item finder and legitimate owner. | Staged for Sprint 8 accompanying REQ-30. |
| **REQ-33** | Productivity | Pomodoro Focus Study Timer | Configurable study clock (5 to 120 minutes) with local browser persistence and background audio chimes. | Staged for Sprint 8 as a standalone frontend widget. |
| **REQ-36** | Messaging Channels | Secondary Telegram Bot Gateway | Dual-channel conversational interface supporting identical task extraction commands via Telegram Bot API. | Staged for Sprint 8 if WhatsApp gateway demonstrates zero operational issues. |
| **REQ-39** | Quality Assurance | Automated Stress & Load Testing | Automated Locust swarm simulating 1,000 concurrent students accessing endpoints during morning peak windows. | Mandatory verification test staged at the end of Sprint 8 before v1.0 release. |

---

## 4. Excluded Capabilities & System Boundaries (Out-of-Scope v1.0 / Roadmap v2.0)

The following requirements have been analyzed and formally excluded from the v1.0 delivery cycle. Their exclusion is technically and operationally justified below and recorded in the project's long-term roadmap:

| Requirement ID | Domain | Deferred Capability | Architectural & Operational Justification for Deferral |
| :--- | :--- | :--- | :--- |
| **REQ-04** | Digital ID | Visual Virtual ID Card Replica | Operating as an unofficial graphic replica introduces student confusion at gates unless backed by institutional security protocol. |
| **REQ-05** | Digital ID | Virtual Code 128 Barcode | Requires optical barcode scanners calibrated for smartphone screen glare across turnstiles; university hardware does not officially support digital screen scanning. |
| **REQ-07** | Digital ID | Gatekeeper Security App Module | Requires procurement of dedicated institutional mobile devices and formal training for university private security contractors across 3 campuses. |
| **REQ-21** | Dining Hall | Real-Time Occupancy Traffic Light | Dining hall attendance is erratic and depends on manual counter updates by cafeteria staff who lack official integration into the project. |
| **REQ-22** | Dining Hall | Daily Menu Publishing | The central university dining service does not maintain a published digital API or regular schedule for daily dietary offerings. |
| **REQ-23** | Dining Hall | Crowdsourced Queue Time Voting | High risk of gaming and low statistical significance during off-peak hours without physical turnstile counter integration. |
| **REQ-24** | Dining Hall | PostGIS GPS Radius Geofencing | Geofencing validation requires continuous geolocation permissions which trigger high battery drain and user privacy pushback on student devices. |
| **REQ-27** | Campus GIS | Building Floorplan GeoJSON Polygons | Detailed architectural blueprints for multi-story pavilions are restricted for internal university security and not publicly digitized. |
| **REQ-34** | Mobile OS | Distracting Application Blocker | Requires native Android Accessibility permissions (`BIND_ACCESSIBILITY_SERVICE`) which cannot be executed within a Progressive Web App (PWA). |
| **REQ-35** | Mobile OS | OS-Level Scheduled Study Alarms | Strict background execution limits in modern mobile operating systems terminate PWA background workers after brief inactivity periods. |
| **REQ-40** | Legacy Systems | Direct Integration with SISUNSA | SISUNSA provides no public REST API. Automated screen scraping violates UNSA institutional IT data governance policies and risks account suspension. |

---

## 5. Non-Functional Requirements (NFR Baseline)

* **NFR-01 (Performance):** 95th percentile API response time must remain below 300 ms under a baseline load of 200 concurrent active users.
* **NFR-02 (Offline Load Time):** Cached PWA assets and student schedules must render in under 500 ms on mobile devices without active internet connection.
* **NFR-03 (Security & Confidentiality):** All student tokens must use RS256 or HS256 signed JWTs with 1-hour access token lifetimes and secure HTTP-only cookies.
* **NFR-04 (Test Coverage Target):** Core backend services (NLP parsing, schedule calculation, OTP security, RBAC) must achieve >= 80% automated line and branch coverage in Pytest.
* **NFR-05 (Accessibility & Standards):** User interface components must comply with WCAG 2.1 AA contrast standards and provide responsive scaling down to 360 px viewport width.

---

## 6. Document Approval & Lifecycle

* **Authors:** Marco Antonio Marquez Herrera, Ricardo Mauricio Chambilla Perca, Alejandro Sebastian Alfonso Huacasi, Italo Frankdux Ccoscco Alvis
* **Engineering Methodology:** Hybrid BDD (Gherkin acceptance criteria) + Selective TDD (Pytest unit suites for domain core)
* **Target Delivery:** 9 One-Week Sprints (S1 through S9, October - December 2026)
* **Weekly Review Milestones:** Every Wednesday at 18:00 UTC-5
