---
name: campusunsa-wiki-orchestrator
description: Autonomous issue-driven GitHub Wiki lifecycle orchestrator for CampusUNSA. Progressively builds, expands, and synchronizes an Oppia-caliber GitHub Wiki on every issue closure, adapting dynamically to evolving agile user stories.
---

# CampusUNSA Wiki Orchestrator (`campusunsa-wiki-orchestrator`)

## 1. Overview & Core Mission

The `campusunsa-wiki-orchestrator` skill establishes an automated, issue-driven documentation lifecycle for CampusUNSA. Its mission is to incrementally construct, refine, and maintain an authoritative GitHub Wiki matching the structural rigor, architectural clarity, and modular onboarding standards of the **Oppia** project benchmark (`oppia/oppia.wiki`).

Rather than treating documentation as a disconnected post-release task, every resolved issue or user story (e.g., `feature/04-classroom-sync`) triggers this skill to update or create its corresponding Oppia-style wiki page, keeping the knowledge base continuously synchronized with the evolving code.

---

## 2. Inviolable Documentation Invariants

Every wiki page generated or updated by this skill MUST strictly adhere to the following rules:

1. **ZERO EMOJIS (Strict Prohibition):**
   * No unicode emojis, emoticons, or GitHub emoji shortcodes are permitted in any wiki page, sidebar, diagram, or commit message.
2. **ENGLISH ONLY IN ALL ARTIFACTS:**
   * Regardless of user conversation language, all wiki markdown pages must be authored in standard technical English.
3. **OPPIA STRUCTURAL TAXONOMY:**
   * Every functional module page must include: Table of Contents, Overview & Architectural Context, Layered Anatomy (Controller/Service/Storage), a Mermaid sequence diagram, Schemas/Models table, and CLI test runbooks.
4. **LINK & SYNTAX INTEGRITY:**
   * All internal wiki links must use valid bracket syntax `[[Label|Target-Page]]` and point to verified pages.
   * All Mermaid blocks must specify valid diagram types (`sequenceDiagram`, `flowchart LR`, etc.).

---

## 3. Operational Issue Closure Workflow

Whenever an AI agent or developer completes an issue or prepares a Pull Request resolving an issue (`Closes #X`), follow this protocol:

### Step 1: Execute Wiki Engine for the Target Issue
Run `scripts/wiki_engine.py` with the issue number:
```bash
python scripts/wiki_engine.py --issue <ISSUE_NUMBER> --wiki-dir .wiki_workspace
```

### Step 2: Validate Against Quality Oracle
Verify that the updated wiki workspace passes all validation checks:
```bash
python scripts/wiki_validator.py .wiki_workspace
```

### Step 3: Verify Oppia Structural Parity
Check that the newly authored or updated page achieves an Oppia Parity Score >= 80%:
```bash
python scripts/oppia_comparator.py .wiki_workspace/<TARGET_PAGE>.md
```

### Step 4: Synchronize with GitHub Wiki Remote
Commit and push the staged wiki pages to the repository's GitHub Wiki:
```bash
# In the wiki workspace
git add -A
git commit -m "docs(wiki): update <MODULE_NAME> architecture for issue #<ISSUE_NUMBER>"
git push origin master
```

---

## 4. Agile Scalability & Dynamic Discovery Engine

CampusUNSA follows an agile, sprint-driven development lifecycle where new user stories, change requests, and spikes are continuously added to the backlog.

The skill handles future issues through a **Dynamic Agile Inference Engine**:
1. **Predefined Lookup:** First checks `mapping/issue_taxonomy_map.json` for cataloged user stories.
2. **Dynamic Fallback:** If an issue is novel or not yet mapped, the engine automatically:
   - Inspects the active branch name (`feature/<id>-<slug>`).
   - Inspects conventional commit scopes (`feat(<scope>): ...`).
   - Inspects touched file paths (`backend/app/...`, `frontend/...`).
   - Assigns the issue to the appropriate architectural category (or registers a new category).
   - Dynamically registers the issue into `mapping/issue_taxonomy_map.json` and updates `_Sidebar.md`.
3. **Manual Registration:** Developers or agents can also explicitly register arbitrary future user stories using:
   ```bash
   python scripts/wiki_engine.py --register --issue <ID> --page <PAGE_NAME>.md --category <CATEGORY_ID> --title "<TITLE>"
   ```

---

## 5. Architectural Category Taxonomy

The wiki organizes knowledge across eight core categories inspired by Oppia:

1. **Onboarding & Community (`onboarding_and_meta`):** Welcoming portal (`Home.md`), developer guides, coding conventions.
2. **Codebase Architecture (`architecture_and_core`):** System topology, web server anatomy, request lifecycles.
3. **Security & Identity (`security_and_auth`):** Google Workspace OAuth2 (`@unsa.edu.pe`), RBAC policies, JWT session claims.
4. **Academic Hub & Synchronization (`academic_hub`):** Google Classroom sync, DUTIC scraper, schedules, task board.
5. **Conversational Gateway & NLP (`messaging_and_nlp`):** Evolution API WhatsApp webhooks, Gemini/Ollama NLP parser, 300s Redis OTP.
6. **Student Guidance & Support (`student_guidance`):** Secretarial desk ticketing, bureaucracy guides.
7. **Testing & Quality Gates (`testing_and_qa`):** Pytest unit/integration test suites, Vitest, verification oracle.
8. **DevOps & Production Operations (`operations_and_devops`):** Docker Compose environment, Alembic migrations, Nginx reverse proxy.

---

## 6. CLI Tooling Directory

* **`scripts/wiki_engine.py`:** Master orchestrator for initializing workspaces, updating issues, and updating `_Sidebar.md`.
* **`scripts/wiki_validator.py`:** Verification oracle checking emojis, broken links, and Mermaid blocks.
* **`scripts/oppia_comparator.py`:** Structural comparison oracle evaluating parity against `wikis/oppia.wiki/`.
