# CampusUNSA: Agile Project Plan & Engineering Workload Matrix

> Academic Course: Software Project Management — Universidad Nacional de San Agustín (UNSA)  
> Project Identifier: PLAN-CAMPUSUNSA-2026-V1.0  
> Execution Cadence: 9 One-Week Sprints (October 07, 2026 to December 09, 2026)  
> Milestone Demonstrations: Every Wednesday at 18:00 UTC-5  
> Repository: https://github.com/MarcoXMarquez/CampusUNSA  
> Interactive Board: [GitHub Projects Board #5](https://github.com/users/MarcoXMarquez/projects/5)

---

## 1. Engineering Team & Ownership Matrix

The engineering workload is distributed evenly across all 4 team members utilizing a Pair Programming (Lead Developer + Peer Reviewer) model:

| Team Member | GitHub Handle | Primary Responsibilities | Secondary / QA Responsibilities | Assigned Stories (Count) |
| :--- | :--- | :--- | :--- | :---: |
| **Marco Antonio Marquez Herrera** | `@MarcoXMarquez` | Architecture, Google OAuth, Classroom API, Secretarial Desk | Code Review, Security Auditing, Pilot Coordination | 8 Stories |
| **Ricardo Mauricio Chambilla Perca** | `@rikich3` | Backend Domain Services, NLP Parsing, OTP Security, RAG | Schedule Algorithms, QA Testing, Pilot | 8 Stories |
| **Alejandro Sebastian Alfonso Huacasi** | `@Sebastianzzzin` | Frontend Web, Task Board UI, PWA Offline, Docker & Load Tests | Webhooks, Procedures Flowchart, Pilot | 8 Stories |
| **Italo Frankdux Ccoscco Alvis** | `@iccoscco` | Frontend UI/UX, Procedure Guides, Ticketing Console, Auth UI | PWA Testing, Usability Auditing, Pilot | 7 Stories |

---

## 2. Complete Engineering Backlog (Issues #1 to #21)

| Issue # | Story Code | Issue Title | Sprint | Review Date | Lead Developer | Peer Reviewer | MoSCoW Priority |
| :---: | :---: | :--- | :---: | :---: | :--- | :--- | :---: |
| **#1** | `US-01` | Fully Reproducible Containerized Development Environment | Sprint 1 | Wed Oct 14 | `@MarcoXMarquez` | `@rikich3` | Must Have |
| **#2** | `US-02` | Institutional Google OAuth Login & Profile Provisioning | Sprint 2 | Wed Oct 21 | `@MarcoXMarquez` | `@iccoscco` | Must Have |
| **#3** | `US-03` | Role-Based Access Control (RBAC) Security Middleware | Sprint 2 | Wed Oct 21 | `@rikich3` | `@Sebastianzzzin` | Must Have |
| **#4** | `US-04` | Google Classroom Course & Assignment Sync Engine | Sprint 3 | Wed Oct 28 | `@MarcoXMarquez` | `@Sebastianzzzin` | Must Have |
| **#5** | `US-05` | Visual Academic Task Board with Urgency Traffic Lights | Sprint 4 | Wed Nov 04 | `@Sebastianzzzin` | `@iccoscco` | Must Have |
| **#6** | `US-06` | Dynamic Weekly Class Schedule & Next Class Widget | Sprint 4 | Wed Nov 04 | `@rikich3` | `@MarcoXMarquez` | Must Have |
| **#7** | `US-07` | PWA Service Worker Caching & 100% Offline Mode | Sprint 4 | Wed Nov 04 | `@Sebastianzzzin` | `@iccoscco` | Must Have |
| **#8** | `US-08` | Secure 5-Minute OTP WhatsApp Phone Binding Lifecycle | Sprint 5 | Wed Nov 11 | `@rikich3` | `@MarcoXMarquez` | Must Have |
| **#9** | `US-09` | Evolution API Inbound Webhook Ingestion Gateway | Sprint 5 | Wed Nov 11 | `@Sebastianzzzin` | `@rikich3` | Must Have |
| **#10** | `US-10` | NLP Task Extraction via Structured LLM Parsing | Sprint 6 | Wed Nov 18 | `@rikich3` | `@MarcoXMarquez` | Must Have |
| **#11** | `US-11` | Automated Task Insertion with WhatsApp Confirmation | Sprint 6 | Wed Nov 18 | `@iccoscco` | `@Sebastianzzzin` | Must Have |
| **#12** | `US-12` | Interactive University Procedures and Bureaucracy Flowcharts | Sprint 7 | Wed Nov 25 | `@iccoscco` | `@Sebastianzzzin` | Must Have |
| **#13** | `US-13` | Human Secretarial Escalation & Ticket Management Console | Sprint 7 | Wed Nov 25 | `@MarcoXMarquez` | `@iccoscco` | Must Have |
| **#14** | `US-14` | Official Regulations Knowledge Base & RAG Query Engine | Sprint 8 | Wed Dec 02 | `@rikich3` | `@MarcoXMarquez` | Should Have |
| **#15** | `US-15` | Automated Load and Stress Verification (1,000 Users) | Sprint 8 | Wed Dec 02 | `@Sebastianzzzin` | `@iccoscco` | Should Have |
| **#16** | `US-16` | System Hardening, 30-Student Live Pilot & Release v1.0 | Sprint 9 | Wed Dec 09 | `@MarcoXMarquez` | All Team Members | Must Have |
| **#17** | `Candidate` | Campus GIS Navigation & Classroom Locator | Sprint 8 | Wed Dec 02 | `@Sebastianzzzin` | `@iccoscco` | Should Have |
| **#18** | `Candidate` | Community Lost & Found Hub with Verified Claims | Sprint 8 | Wed Dec 02 | `@rikich3` | `@iccoscco` | Should Have |
| **#19** | `Candidate` | Study Session Pomodoro Focus Timer & iCal Export | Sprint 8 | Wed Dec 02 | `@MarcoXMarquez` | `@Sebastianzzzin` | Should Have |
| **#20** | `Future` | Digital Student ID Barcode & Turnstile Integration | Posterior | Post-v1.0 | `@MarcoXMarquez` | `@rikich3` | Won't Have |
| **#21** | `Future` | Dining Hall Occupancy Geofencing & SISUNSA Scraping | Posterior | Post-v1.0 | `@Sebastianzzzin` | `@iccoscco` | Won't Have |

---

## 3. Sprint Timeline & Delivery Dates

* **Sprint 1 (Architecture & DevOps Foundation):** October 07 - October 14, 2026 (Demo: Oct 14)
* **Sprint 2 (Identity & Security Enforcement):** October 14 - October 21, 2026 (Demo: Oct 21)
* **Sprint 3 (Academic Ingestion - Classroom):** October 21 - October 28, 2026 (Demo: Oct 28)
* **Sprint 4 (Academic Hub & PWA Offline):** October 28 - November 04, 2026 (Demo: Nov 04)
* **Sprint 5 (Messaging Gateway & OTP Auth):** November 04 - November 11, 2026 (Demo: Nov 11)
* **Sprint 6 (NLP Task Extraction & Board Sync):** November 11 - November 18, 2026 (Demo: Nov 18)
* **Sprint 7 (Student Guidance & Secretarial Desk):** November 18 - November 25, 2026 (Demo: Nov 25)
* **Sprint 8 (Candidate Extensions & Load Verification):** November 25 - December 02, 2026 (Demo: Dec 02)
* **Sprint 9 (System Hardening, 30-Student Pilot & v1.0 Release):** December 02 - December 09, 2026 (Final Demo: Dec 09)

---

## 4. Definition of Done (DoD) Criteria

Every User Story and engineering task must satisfy the following checklist prior to merging into `main` and closing its corresponding GitHub issue:
1. **Automated Unit & Integration Tests:** Pytest or Vitest test suites passing with zero errors.
2. **Test Coverage Threshold:** Core business logic maintains >= 80% line and branch test coverage.
3. **Static Analysis & Linting:** Clean run on `ruff`, `black`, and `eslint`.
4. **Peer Review:** Pull Request approved by the designated secondary reviewer.
5. **Acceptance Criteria Verification:** All Gherkin scenarios verified in the containerized staging environment.
