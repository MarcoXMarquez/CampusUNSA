# {{MODULE_TITLE}}

## Table of Contents
* [Overview & Architectural Context](#overview--architectural-context)
* [Anatomy of the Service (Layered Architecture)](#anatomy-of-the-service-layered-architecture)
* [Request & Data Lifecycle](#request--data-lifecycle)
* [Schemas & Models Reference](#schemas--models-reference)
* [Testing & Quality Verification](#testing--quality-verification)
* [Common Issues & Troubleshooting](#common-issues--troubleshooting)

---

## Overview & Architectural Context

{{MODULE_DESCRIPTION}}

* **Target Functional Domain:** {{FUNCTIONAL_DOMAIN}}
* **Primary Source Files:**
  * Router / Controller: [{{CONTROLLER_PATH}}]({{CONTROLLER_URL}})
  * Service / Business Logic: [{{SERVICE_PATH}}]({{SERVICE_URL}})
  * Persistence / Models: [{{MODEL_PATH}}]({{MODEL_URL}})
* **Associated Issues:** {{ASSOCIATED_ISSUES}}

---

## Anatomy of the Service (Layered Architecture)

Following the standard Oppia web server layered architecture, {{MODULE_TITLE}} strictly segregates responsibilities across three isolated tiers:

```
+-----------------------------------------------------------------------------------+
| 1. Controller Layer (FastAPI APIRouter)                                           |
|    - Endpoint registration, JWT claim verification, Pydantic input validation     |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| 2. Domain Service Layer (Pure Business Logic)                                     |
|    - Idempotent transformations, algorithmic calculations, external adapters      |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| 3. Storage Layer (SQLAlchemy 2.0 / PostgreSQL / Redis)                            |
|    - Declarative ORM models, transaction lifecycle, Redis TTL caches              |
+-----------------------------------------------------------------------------------+
```

---

## Request & Data Lifecycle

The following sequence diagram models the end-to-end lifecycle when a client triggers this service:

```mermaid
---
title: {{MODULE_TITLE}} Request Flow
---
sequenceDiagram
    autonumber
    actor Client as PWA / WhatsApp User
    participant Router as FastAPI Router
    participant Service as Domain Service
    participant Cache as Redis 7 Cache
    participant DB as PostgreSQL 16
    
    Client->>Router: {{HTTP_METHOD}} {{ENDPOINT_PATH}}
    Note over Router: Pydantic input schema validation
    Router->>Service: Execute business operation
    opt Check Cache / Rate Limit
        Service->>Cache: Query session / TTL key
        Cache-->>Service: Return state
    end
    Service->>DB: Execute query / upsert transaction
    DB-->>Service: Commit & return entities
    Service-->>Router: Return domain response model
    Router-->>Client: HTTP 200 OK (JSON payload)
```

---

## Schemas & Models Reference

### Key Input and Output Models
| Model Name | Role | File Location | Key Attributes |
| :--- | :--- | :--- | :--- |
{{SCHEMAS_TABLE_ROWS}}

---

## Testing & Quality Verification

To verify the integrity of this module without side-effects, run the isolated test suite inside the containerized environment:

```bash
# Run isolated Pytest suite for this module
docker compose exec backend python -m pytest {{TEST_PATH}} -v --cov={{MODULE_SRC_PATH}}

# Validate PEP8 compliance and linting
docker compose exec backend ruff check {{CONTROLLER_PATH}} {{SERVICE_PATH}}
```

### Expected Quality Assertions:
1. Test coverage must meet or exceed the repository threshold of **80%**.
2. Zero emojis in docstrings, test case descriptions, or responses.
3. Strict type annotations on all service functions.

---

## Common Issues & Troubleshooting

> [!NOTE]
> Operational tips and failure resolution runbook.

* **Issue 1:** {{TROUBLESHOOTING_ISSUE_1}}
  * *Resolution:* {{TROUBLESHOOTING_RES_1}}
* **Issue 2:** {{TROUBLESHOOTING_ISSUE_2}}
  * *Resolution:* {{TROUBLESHOOTING_RES_2}}
