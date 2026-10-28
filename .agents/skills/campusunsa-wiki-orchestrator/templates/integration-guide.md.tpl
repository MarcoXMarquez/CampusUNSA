# {{INTEGRATION_TITLE}}

## Table of Contents
* [Overview & Architecture](#overview--architecture)
* [Prerequisites & Account Requirements](#prerequisites--account-requirements)
* [Step-by-Step Configuration Guide](#step-by-step-configuration-guide)
* [Environment Configuration](#environment-configuration)
* [Webhook & Event Lifecycle](#webhook--event-lifecycle)
* [Verification & Automated Tests](#verification--automated-tests)

---

## Overview & Architecture

{{INTEGRATION_DESCRIPTION}}

* **Provider / Service:** {{INTEGRATION_PROVIDER}}
* **Protocol / Ingress:** {{INTEGRATION_PROTOCOL}}
* **Security & Boundary:** {{SECURITY_BOUNDARY}}
* **Associated Issues:** {{ASSOCIATED_ISSUES}}

```mermaid
---
title: {{INTEGRATION_TITLE}} Integration Architecture
---
flowchart LR
    External["{{INTEGRATION_PROVIDER}}<br>({{INTEGRATION_PROTOCOL}})"]
    Gateway["Ingress Gateway / Webhook<br>(CampusUNSA Container)"]
    Service["Internal Service Core<br>(FastAPI Async Handler)"]
    Storage[("Persistence Tier<br>(PostgreSQL / Redis)")]

    External -->|Signed Payload / Webhook| Gateway
    Gateway -->|Validated Event| Service
    Service -->|Idempotent Upsert| Storage
```

---

## Prerequisites & Account Requirements

Before configuring this integration, ensure you possess:
1. Access to the target platform console / administrator dashboard.
2. Verified domain credentials (e.g., institutional `@unsa.edu.pe` Google Workspace).
3. The local `.env` file copied from `.env.example`.

---

## Step-by-Step Configuration Guide

{{SETUP_STEPS_MARKDOWN}}

---

## Environment Configuration

Configure the following parameters in your `.env` file:

```ini
{{ENV_VARIABLES_SNIPPET}}
```

---

## Webhook & Event Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant Ext as {{INTEGRATION_PROVIDER}}
    participant App as CampusUNSA Ingress
    participant Q as Redis Queue / Event Bus
    participant Worker as Background Sync Service

    Ext->>App: POST /api/v1/webhooks/{{WEBHOOK_SLUG}}
    Note over App: Validate signature & authorization headers
    App-->>Ext: HTTP 200 OK (Fast ACK < 500ms)
    App->>Q: Enqueue payload with event ID
    Q->>Worker: Dispatch job to worker
    Worker->>Worker: Parse & persist data idempotently
```

---

## Verification & Automated Tests

Verify the integration using mock adapters and unit tests:

```bash
# Run unit tests with mock integration responses
docker compose exec backend python -m pytest {{TEST_PATH}} -v
```
