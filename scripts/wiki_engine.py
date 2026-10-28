#!/usr/bin/env python3
"""
CampusUNSA Wiki Engine and Lifecycle Orchestrator
Automates the creation, expansion, and synchronization of Oppia-caliber
GitHub Wiki pages triggered upon issue closure or on demand.
"""

import os
import sys
import json
import argparse
import subprocess
import re
from typing import Dict, Any, List, Optional


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAPPING_FILE = os.path.join(
    PROJECT_ROOT,
    ".agents/skills/campusunsa-wiki-orchestrator/mapping/issue_taxonomy_map.json",
)
TEMPLATES_DIR = os.path.join(
    PROJECT_ROOT, ".agents/skills/campusunsa-wiki-orchestrator/templates"
)
DEFAULT_WIKI_DIR = os.path.join(PROJECT_ROOT, ".wiki_workspace")


def load_taxonomy_map() -> Dict[str, Any]:
    """Load declarative issue taxonomy map from JSON."""
    if not os.path.exists(MAPPING_FILE):
        return {"categories": [], "issue_mappings": {}, "dynamic_heuristics": {}}
    with open(MAPPING_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_taxonomy_map(data: Dict[str, Any]) -> None:
    """Save updated taxonomy map back to JSON."""
    with open(MAPPING_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_git_diff_summary() -> Dict[str, Any]:
    """Inspect current git diff and changed files."""
    try:
        res = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1..HEAD"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        )
        files = [line.strip() for line in res.stdout.splitlines() if line.strip()]
        if not files:
            res_status = subprocess.run(
                ["git", "status", "--porcelain"],
                capture_output=True,
                text=True,
                cwd=PROJECT_ROOT,
            )
            files = [
                line.split()[-1]
                for line in res_status.stdout.splitlines()
                if line.strip()
            ]

        # Extract current branch
        branch_res = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        )
        current_branch = branch_res.stdout.strip()

        # Extract last commit message
        commit_res = subprocess.run(
            ["git", "log", "-1", "--pretty=%B"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        )
        last_commit = commit_res.stdout.strip()

        return {
            "files": files,
            "branch": current_branch,
            "commit_msg": last_commit,
        }
    except Exception as e:
        return {"files": [], "branch": "", "commit_msg": "", "error": str(e)}


def dynamic_infer_category_and_page(
    issue_id: str, diff_info: Dict[str, Any], taxonomy: Dict[str, Any]
) -> Dict[str, str]:
    """
    Agile Dynamic Inference Engine:
    Determines category and target wiki page for ANY new, unanticipated issue or user story
    based on branch naming, commit scope, and touched file paths.
    """
    heuristics = taxonomy.get("dynamic_heuristics", {})
    branch = diff_info.get("branch", "")
    commit = diff_info.get("commit_msg", "")
    files = diff_info.get("files", [])

    # 1. Match from commit scope, e.g. feat(auth): ...
    scope_match = re.search(r"^[a-zA-Z]+\(([a-zA-Z0-9_-]+)\):", commit)
    if scope_match:
        scope = scope_match.group(1).lower()
        scope_rules = heuristics.get("commit_scope_rules", {})
        if scope in scope_rules:
            rule = scope_rules[scope]
            return {
                "category": rule["category"],
                "target_page": rule["target_page"],
                "title": f"Feature {scope.capitalize()} (Issue #{issue_id})",
            }

    # 2. Match from file path rules
    path_rules = heuristics.get("path_rules", [])
    for f in files:
        for pr in path_rules:
            if re.search(pr["pattern"], f):
                return {
                    "category": pr["category"],
                    "target_page": pr["target_page_fallback"],
                    "title": f"Module {pr['category'].replace('_', ' ').title()} (Issue #{issue_id})",
                }

    # 3. Match from branch name, e.g. feature/42-biomedicas-lab
    branch_match = re.search(r"feature/\d+-(.+)", branch)
    if branch_match:
        slug = branch_match.group(1).replace("-", " ").title()
        page_name = f"{slug.replace(' ', '-')}.md"
        return {
            "category": "academic_hub",
            "target_page": page_name,
            "title": f"{slug} (Issue #{issue_id})",
        }

    # Default fallback
    return {
        "category": "architecture_and_core",
        "target_page": f"User-Story-{issue_id}-Feature.md",
        "title": f"User Story #{issue_id} Architecture",
    }


def update_sidebar(wiki_dir: str, taxonomy: Dict[str, Any]) -> None:
    """Generate and write updated _Sidebar.md based on current taxonomy categories."""
    sidebar_path = os.path.join(wiki_dir, "_Sidebar.md")
    categories = taxonomy.get("categories", [])
    
    # Collect all existing markdown files in wiki_dir
    all_pages = set()
    if os.path.exists(wiki_dir):
        for f in os.listdir(wiki_dir):
            if f.endswith(".md"):
                all_pages.add(f)

    sidebar_lines = [
        "<!-- CampusUNSA Wiki Persistent Navigation Sidebar -->",
        "<!-- Oppia-Caliber Structural Taxonomy -->",
        "",
        "### CampusUNSA Knowledge Base",
        "",
        "* **[[Home|Home]]**",
        "* **[[System Architecture|Overview-of-CampusUNSA-Architecture]]**",
        "* **[[Contributing Guide|Contributing-to-CampusUNSA]]**",
        "",
        "---",
    ]

    for cat in categories:
        cat_title = cat["title"]
        pages = cat.get("default_pages", [])
        for iss_data in taxonomy.get("issue_mappings", {}).values():
            if iss_data.get("category") == cat["id"]:
                tp = iss_data.get("target_page")
                if tp and tp not in pages:
                    pages.append(tp)

        # Only list pages that actually exist in the wiki directory
        existing_cat_pages = [p for p in pages if p in all_pages]
        if existing_cat_pages:
            cat_lines = [f"**{cat_title}**"]
            for p in existing_cat_pages:
                base_name = os.path.splitext(p)[0]
                display_name = base_name.replace("-", " ")
                cat_lines.append(f"  * [[{display_name}|{base_name}]]")
            sidebar_lines.extend(cat_lines)
            sidebar_lines.append("")

    sidebar_lines.extend([
        "---",
        "* **[[Quality Gates & CI|Verification-Oracle-and-Quality-Gates]]**",
        "* **[[Production Deployment|Production-Deployment-and-Hardening]]**",
    ])

    with open(sidebar_path, "w", encoding="utf-8") as f:
        f.write("\n".join(sidebar_lines) + "\n")
    print(f"Updated: {sidebar_path}")


def init_wiki_workspace(wiki_dir: str) -> None:
    """Bootstrap the initial Oppia-caliber wiki workspace with foundational pages."""
    os.makedirs(wiki_dir, exist_ok=True)
    taxonomy = load_taxonomy_map()

    # 1. Home.md
    home_path = os.path.join(wiki_dir, "Home.md")
    if not os.path.exists(home_path):
        home_content = """# Welcome to the CampusUNSA Knowledge Base

CampusUNSA is an offline-resilient, centralized academic operating hub engineered for the 25,000+ students and faculty members of Universidad Nacional de San Agustin de Arequipa (UNSA) across its three campuses: Area de Ingenierias, Area de Biomedicas, and Area de Sociales.

This wiki provides comprehensive developer guides, architectural sequence diagrams, integration specifications, and administrative workflows modeled under the high-rigor standards of the **Oppia** documentation framework.

---

## Fast-Track Directory by Contributor Role

Choose the learning pathway that matches your mission:

* **[[New Developers|Contributing-to-CampusUNSA]]:** 5-minute containerized setup, coding standards, and your first PR.
* **[[System Architects|Overview-of-CampusUNSA-Architecture]]:** C4 Level 1 context, Level 2 container topologies, and request lifecycles.
* **[[Integrators & Security|Auth-and-Institutional-SSO]]:** Google Workspace OAuth2 (@unsa.edu.pe) and Evolution API WhatsApp gateways.
* **[[Quality Assurance|Verification-Oracle-and-Quality-Gates]]:** Zero-emoji policies, Pytest coverage >= 80%, and verification runbooks.
* **[[Administrative Staff|Secretarial-Helpdesk-and-Ticketing]]:** Bureaucracy flowcharts and secretarial handoff queues.

---

## Core System Architecture Snapshot

```mermaid
---
title: CampusUNSA Dual-Channel High-Level Architecture
---
flowchart LR
    PWA["Next.js 14 PWA<br>(Offline / IndexedDB)"]
    WhatsApp["WhatsApp Ingress<br>(Evolution API Gateway)"]
    Backend["FastAPI Core Service<br>(Python 3.11 / REST)"]
    Postgres[("PostgreSQL 16<br>ACID Relational Storage")]
    RedisCache[("Redis 7<br>300s OTP & Queues")]

    PWA -->|HTTPS / REST| Backend
    WhatsApp -->|Webhook Events| Backend
    Backend --> Postgres
    Backend --> RedisCache
```

---

## Community & Governance Standards

All contributions must follow our core engineering directives:
1. **Zero-Emoji Prohibition:** No emojis in code, docstrings, tests, or documentation.
2. **English-Only Policy:** All repository and wiki artifacts must be authored in technical English.
3. **Automated Verification:** All changes must pass `./scripts/verify.sh` prior to merge.
"""
        with open(home_path, "w", encoding="utf-8") as f:
            f.write(home_content)
        print(f"Created: {home_path}")

    # 2. Architecture Overview
    arch_path = os.path.join(wiki_dir, "Overview-of-CampusUNSA-Architecture.md")
    if not os.path.exists(arch_path):
        arch_content = """# Overview of CampusUNSA Architecture

## Table of Contents
* [System Context & Goals](#system-context--goals)
* [Web Server Anatomy (Layered Architecture)](#web-server-anatomy-layered-architecture)
* [Client Tier: Offline-First PWA](#client-tier-offline-first-pwa)
* [Messaging Tier: WhatsApp Evolution Gateway](#messaging-tier-whatsapp-evolution-gateway)
* [Data Tier: Relational and Caching](#data-tier-relational-and-caching)

---

## System Context & Goals

CampusUNSA operates under an offline-first modular monolithic architecture. Its primary design goal is ensuring sub-500ms data availability inside shielded university campus buildings without dependable cellular network signal.

---

## Web Server Anatomy (Layered Architecture)

Modeled after Oppia's web server architecture, our FastAPI backend isolates responsibilities into three distinct tiers:

```mermaid
---
title: Anatomy of a Web Request in CampusUNSA
---
sequenceDiagram
    autonumber
    actor Student as UNSA Student
    participant PWA as Next.js 14 PWA (Browser)
    participant Router as FastAPI Router (/api/v1/)
    participant Service as Business Domain Service
    participant Storage as SQLAlchemy 2.0 / PostgreSQL

    Student->>PWA: Inspect class schedule
    alt Offline Mode
        PWA-->>Student: Return cached schedule from IndexedDB (< 500ms)
    else Online Mode
        PWA->>Router: GET /api/v1/schedule/current
        Note over Router: Verify JWT & institutional @unsa.edu.pe claim
        Router->>Service: Compute next class countdown
        Service->>Storage: Query active course & pavilion
        Storage-->>Service: Return row records
        Service-->>Router: Return ScheduleResponse schema
        Router-->>PWA: HTTP 200 OK (JSON)
        PWA->>PWA: Update local IndexedDB cache
        PWA-->>Student: Render interactive schedule
    end
```

---

## Client Tier: Offline-First PWA

* Built using **Next.js 14 App Router** and **Tailwind CSS**.
* Employs Workbox Service Workers with `StaleWhileRevalidate` caching strategies.
* Stores courses, tasks, and student schedules inside IndexedDB.

---

## Data Tier: Relational and Caching

* **PostgreSQL 16:** Enforces relational integrity across users, courses, coursework, submissions, and tickets.
* **Redis 7:** Manages rate limiting, queue dispatching, and 5-minute (300-second) OTP token lifecycles.
"""
        with open(arch_path, "w", encoding="utf-8") as f:
            f.write(arch_content)
        print(f"Created: {arch_path}")

    # 3. Contributing Guide
    contrib_path = os.path.join(wiki_dir, "Contributing-to-CampusUNSA.md")
    if not os.path.exists(contrib_path):
        contrib_content = """# Contributing to CampusUNSA

## Table of Contents
* [Welcome & Expectations](#welcome--expectations)
* [Local Development Environment Setup](#local-development-environment-setup)
* [Branching & Git Workflow](#branching--git-workflow)
* [Quality Gates & Verification](#quality-gates--verification)
* [Submitting a Pull Request](#submitting-a-pull-request)

---

## Welcome & Expectations

Thank you for contributing to CampusUNSA! Our platform is engineered by and for the UNSA academic community.

### Inviolable Engineering Rules:
1. **Zero Emojis:** Strictly prohibited across all code, docstrings, commits, and PRs.
2. **English Only:** All artifacts must be written in technical English.
3. **No-Force Git Policy:** Never execute `git push --force` or `--force-with-lease`.
4. **TDD First:** Write failing unit tests before implementing business logic (coverage >= 80%).

---

## Local Development Environment Setup

```bash
# 1. Clone repository
git clone https://github.com/MarcoXMarquez/CampusUNSA.git
cd CampusUNSA

# 2. Configure environment
cp .env.example .env

# 3. Bootstrap containerized stack
docker compose up -d

# 4. Verify running health
docker compose ps
```

---

## Quality Gates & Verification

Before submitting any work, run the unified verification oracle:

```bash
# Linux / macOS / WSL
./scripts/verify.sh

# Windows PowerShell
./scripts/verify.ps1
```
"""
        with open(contrib_path, "w", encoding="utf-8") as f:
            f.write(contrib_content)
        print(f"Created: {contrib_path}")

    # 4. Initial Baseline Pages to satisfy links
    baseline_pages = [
        ("Auth-and-Institutional-SSO.md", "# Auth and Institutional Single Sign-On\n\n## Table of Contents\n* [Overview](#overview)\n\n## Overview\nGoogle Workspace OAuth authentication restricted strictly to `@unsa.edu.pe` institutional accounts.\n\n```mermaid\nflowchart LR\n    User --> GoogleAuth\n    GoogleAuth --> Backend\n```\n"),
        ("Google-Classroom-Sync-Service.md", "# Google Classroom Sync Service\n\n## Table of Contents\n* [Overview](#overview)\n\n## Overview\nContinuous background synchronization engine ingesting coursework and active courses.\n\n```mermaid\nsequenceDiagram\n    Backend->>GoogleClassroom: Fetch courses\n```\n"),
        ("Verification-Oracle-and-Quality-Gates.md", "# Verification Oracle and Quality Gates\n\n## Table of Contents\n* [Oracle Overview](#oracle-overview)\n\n## Oracle Overview\nDeterministic quality verification runner enforcing zero emojis, Ruff linting, and Pytest coverage >= 80%.\n\n```bash\n./scripts/verify.sh\n```\n"),
        ("Production-Deployment-and-Hardening.md", "# Production Deployment and Hardening\n\n## Table of Contents\n* [Deployment Topology](#deployment-topology)\n\n## Deployment Topology\nHardened Docker Compose production stack with Nginx SSL reverse proxy.\n"),
        ("Backend-Tests-Guide.md", "# Backend Tests Guide\n\n## Table of Contents\n* [Test Philosophy](#test-philosophy)\n\n## Test Philosophy\nPytest suites requiring coverage >= 80% with mock database and Redis adapters.\n"),
        ("Secretarial-Helpdesk-and-Ticketing.md", "# Secretarial Helpdesk and Ticketing\n\n## Table of Contents\n* [Overview](#overview)\n\n## Overview\nAdministrative ticketing workflow and secretarial handoff queue.\n\n```mermaid\nflowchart LR\n    Student --> Ticket\n    Ticket --> Secretary\n```\n")
    ]

    for p_name, p_content in baseline_pages:
        p_path = os.path.join(wiki_dir, p_name)
        if not os.path.exists(p_path):
            with open(p_path, "w", encoding="utf-8") as f:
                f.write(p_content)
            print(f"Created baseline: {p_path}")

    # 5. Update Sidebar
    update_sidebar(wiki_dir, taxonomy)
    print("Initialization complete.")


def handle_issue_update(issue_id: str, wiki_dir: str) -> None:
    """Process closed issue, infer taxonomy, render Oppia template, and update wiki."""
    taxonomy = load_taxonomy_map()
    diff_info = get_git_diff_summary()

    mapping = taxonomy.get("issue_mappings", {}).get(str(issue_id))
    if not mapping:
        print(f"Issue #{issue_id} not found in predefined mappings. Triggering Agile Dynamic Inference...")
        mapping = dynamic_infer_category_and_page(issue_id, diff_info, taxonomy)
        print(f"Inferred: Page='{mapping['target_page']}', Category='{mapping['category']}', Title='{mapping['title']}'")
        
        # Save dynamically registered issue into taxonomy map
        taxonomy.setdefault("issue_mappings", {})[str(issue_id)] = mapping
        save_taxonomy_map(taxonomy)
        print(f"Persisted Issue #{issue_id} into issue_taxonomy_map.json.")

    target_page = mapping["target_page"]
    page_title = mapping.get("title", f"Module for Issue #{issue_id}")
    page_path = os.path.join(wiki_dir, target_page)

    # Determine template
    if "OAuth" in page_title or "Gateway" in page_title or "Sync" in page_title:
        template_file = os.path.join(TEMPLATES_DIR, "integration-guide.md.tpl")
    else:
        template_file = os.path.join(TEMPLATES_DIR, "module-architecture.md.tpl")

    if not os.path.exists(template_file):
        template_file = os.path.join(TEMPLATES_DIR, "module-architecture.md.tpl")

    with open(template_file, "r", encoding="utf-8") as tf:
        template_content = tf.read()

    # Fill template variables
    rendered = template_content.replace("{{MODULE_TITLE}}", page_title)
    rendered = rendered.replace("{{MODULE_DESCRIPTION}}", f"Architectural and operational specification for {page_title}, implemented in fulfillment of User Story #{issue_id}.")
    rendered = rendered.replace("{{FUNCTIONAL_DOMAIN}}", mapping.get("category", "General Core").replace("_", " ").title())
    rendered = rendered.replace("{{CONTROLLER_PATH}}", "backend/app/api/v1/...")
    rendered = rendered.replace("{{CONTROLLER_URL}}", "backend/app/api/v1/")
    rendered = rendered.replace("{{SERVICE_PATH}}", "backend/app/services/...")
    rendered = rendered.replace("{{SERVICE_URL}}", "backend/app/services/")
    rendered = rendered.replace("{{MODEL_PATH}}", "backend/app/models/...")
    rendered = rendered.replace("{{MODEL_URL}}", "backend/app/models/")
    rendered = rendered.replace("{{ASSOCIATED_ISSUES}}", f"Issue #{issue_id}")
    rendered = rendered.replace("{{HTTP_METHOD}}", "GET / POST")
    rendered = rendered.replace("{{ENDPOINT_PATH}}", f"/api/v1/{target_page.split('-')[0].lower()}")
    rendered = rendered.replace("{{TEST_PATH}}", "backend/tests/")
    rendered = rendered.replace("{{MODULE_SRC_PATH}}", "app")
    rendered = rendered.replace("{{SCHEMAS_TABLE_ROWS}}", f"| RequestSchema | Input | `backend/app/schemas/` | Validated Pydantic v2 model |\n| EntityModel | Persistence | `backend/app/models/` | SQLAlchemy 2.0 mapped model |")
    rendered = rendered.replace("{{TROUBLESHOOTING_ISSUE_1}}", "Domain mismatch on external credentials.")
    rendered = rendered.replace("{{TROUBLESHOOTING_RES_1}}", "Ensure email ends with `@unsa.edu.pe`.")
    rendered = rendered.replace("{{TROUBLESHOOTING_ISSUE_2}}", "Redis cache key expired.")
    rendered = rendered.replace("{{TROUBLESHOOTING_RES_2}}", "Refresh request to generate a new 300s TTL token.")
    
    # Also handle integration template placeholders
    rendered = rendered.replace("{{INTEGRATION_TITLE}}", page_title)
    rendered = rendered.replace("{{INTEGRATION_DESCRIPTION}}", f"Integration specifications for {page_title} associated with Issue #{issue_id}.")
    rendered = rendered.replace("{{INTEGRATION_PROVIDER}}", "Institutional Provider")
    rendered = rendered.replace("{{INTEGRATION_PROTOCOL}}", "REST / Webhook")
    rendered = rendered.replace("{{SECURITY_BOUNDARY}}", "HMAC Signatures / OAuth2 Bearer")
    rendered = rendered.replace("{{SETUP_STEPS_MARKDOWN}}", "1. Obtain institutional credentials.\n2. Configure callback URIs.\n3. Verify signature verification in webhook ingress.")
    rendered = rendered.replace("{{ENV_VARIABLES_SNIPPET}}", "PROVIDER_CLIENT_ID=sample\nPROVIDER_CLIENT_SECRET=sample")
    rendered = rendered.replace("{{WEBHOOK_SLUG}}", "events")

    with open(page_path, "w", encoding="utf-8") as pf:
        pf.write(rendered)
    print(f"Successfully generated Oppia-style wiki page: {page_path}")

    # Update sidebar
    update_sidebar(wiki_dir, taxonomy)


def main():
    parser = argparse.ArgumentParser(description="CampusUNSA Wiki Engine CLI")
    parser.add_argument("--wiki-dir", default=DEFAULT_WIKI_DIR, help="Target wiki workspace directory")
    parser.add_argument("--init", action="store_true", help="Initialize foundational Oppia-caliber wiki workspace")
    parser.add_argument("--issue", help="Issue / User Story number to process and synchronize")
    parser.add_argument("--validate", action="store_true", help="Run the Wiki Validator oracle")
    parser.add_argument("--register", action="store_true", help="Manually register an agile user story")
    parser.add_argument("--page", help="Page name for manual registration")
    parser.add_argument("--category", help="Category ID for manual registration")
    parser.add_argument("--title", help="Title for manual registration")

    args = parser.parse_args()

    if args.init:
        init_wiki_workspace(args.wiki_dir)
        sys.exit(0)

    if args.register:
        if not (args.issue and args.page and args.category):
            print("ERROR: --register requires --issue, --page, and --category.")
            sys.exit(1)
        taxonomy = load_taxonomy_map()
        taxonomy.setdefault("issue_mappings", {})[str(args.issue)] = {
            "target_page": args.page,
            "category": args.category,
            "title": args.title or f"Feature (Issue #{args.issue})",
        }
        save_taxonomy_map(taxonomy)
        print(f"Successfully registered Issue #{args.issue} -> {args.page} [{args.category}].")
        sys.exit(0)

    if args.issue:
        handle_issue_update(args.issue, args.wiki_dir)
        sys.exit(0)

    if args.validate:
        validator_script = os.path.join(PROJECT_ROOT, "scripts/wiki_validator.py")
        res = subprocess.run([sys.executable, validator_script, args.wiki_dir])
        sys.exit(res.returncode)

    parser.print_help()


if __name__ == "__main__":
    main()
