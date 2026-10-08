# CampusUNSA: System Architecture Document (SAD)

## Document Identifier: SAD-CAMPUSUNSA-2026-V1.0
### Scope: Release v1.0 Architectural Baseline
### Status: Approved Engineering Architecture

---

## 1. Architectural Overview & Design Principles

CampusUNSA implements an offline-resilient, modular monolithic service topology orchestrating student interaction across web and conversational channels. The architecture prioritizes data privacy, zero recurring cloud licensing costs, and sub-second responsiveness inside university grounds.

### Core Architectural Principles
1. **Offline-First PWA Resilience:** Student schedules, tasks, and campus information must load in < 500 ms even when mobile network connectivity fails inside thick pavilion walls.
2. **Zero-Cost Infrastructure Baseline:** Utilizes 100% open-source, containerized stacks (FastAPI, PostgreSQL, Redis, Evolution API) deployable on commodity university servers.
3. **Decoupled Domain Services:** Clean separation between authentication, Google Classroom ingestion, conversational parsing, and secretarial workflows.
4. **Verifiable Quality Gates:** Backend business rules backed by automated Pytest suites (target >= 80% coverage) and BDD acceptance criteria.

---

## 2. C4 Model - Level 1: System Context Diagram

The following diagram illustrates how students, secretarial staff, and external systems interact with the CampusUNSA platform:

```mermaid
flowchart TD
    Student["UNSA Student<br>(Undergraduate / Graduate)"]
    Secretary["Faculty Secretary<br>(Administrative Staff)"]

    System["CampusUNSA Platform<br>(PWA & Conversational Hub)"]

    GoogleAuth["Google Identity Platform<br>(OAuth2 @unsa.edu.pe)"]
    ClassroomAPI["Google Classroom API<br>(Coursework & Schedules)"]
    WhatsAppNet["WhatsApp Network<br>(Student Mobile Messaging)"]

    Student -->|Interacts via Browser / Mobile| System
    Student -->|Sends informal messages / tasks| WhatsAppNet
    WhatsAppNet -->|Inbound Webhooks| System

    Secretary -->|Manages tickets & procedures| System

    System -->|Authenticates users| GoogleAuth
    System -->|Ingests courses & assignments| ClassroomAPI
```

---

## 3. C4 Model - Level 2: Container Architecture

The container topology decomposes the system into isolated Docker services communicating over private virtual bridge networks:

```mermaid
flowchart TD
    subgraph Clients["Client Tier"]
        Browser["Mobile / Desktop Browser<br>(PWA Container - Next.js 14)"]
        WhatsAppClient["WhatsApp Mobile App"]
    end

    subgraph Ingress["Ingress & Gateway Tier"]
        Nginx["Reverse Proxy / Nginx<br>(Port 80/443 SSL Termination)"]
        Evolution["Evolution API Gateway<br>(Baileys Engine - Port 8080)"]
    end

    subgraph AppTier["Application Tier"]
        FastAPI["FastAPI Backend Core<br>(Python 3.11 - Port 8000)"]
        Worker["Async Background Worker<br>(Celery / Asyncio Task Queue)"]
    end

    subgraph DataTier["Data Persistence & Caching Tier"]
        Postgres[("PostgreSQL 16 Database<br>(Users, Tasks, Tickets, Logs)")]
        RedisCache[("Redis 7 In-Memory Store<br>(Cache, Queues, 5-min OTP TTL)")]
    end

    subgraph ExternalServices["External APIs"]
        GoogleIdentity["Google OAuth2 API"]
        GoogleClassroom["Google Classroom REST API"]
        LLMInference["Gemini Flash / Ollama API"]
    end

    Browser -->|HTTPS / WSS| Nginx
    WhatsAppClient -->|E2E Messaging| Evolution

    Nginx -->|Proxy /api| FastAPI
    Nginx -->|Proxy Static / SSR| Browser

    Evolution -->|Webhook POST Events| FastAPI

    FastAPI -->|Enqueue Jobs| RedisCache
    Worker -->|Consume Jobs| RedisCache

    FastAPI -->|Relational Queries| Postgres
    Worker -->|Sync Data| Postgres

    FastAPI -->|Read / Write Fast Cache| RedisCache

    FastAPI -->|Token Verification| GoogleIdentity
    Worker -->|Fetch Coursework| GoogleClassroom
    Worker -->|Structured NLP Extraction| LLMInference
```

---

## 4. C4 Model - Level 3: FastAPI Component Architecture

Inside the FastAPI application core, modules operate under clean layered architecture:

```mermaid
flowchart LR
    subgraph Routers["API Presentation Layer"]
        R_Auth["/api/v1/auth"]
        R_Academic["/api/v1/academic"]
        R_Webhook["/api/v1/webhooks"]
        R_Tickets["/api/v1/tickets"]
    end

    subgraph Security["Cross-Cutting Security"]
        MW_JWT["JWT Verification Guard"]
        MW_RBAC["RBAC Policy Gate"]
        MW_RateLimit["Redis Rate Limiter"]
    end

    subgraph Services["Domain Business Services"]
        S_User["UserService"]
        S_Classroom["ClassroomSyncService"]
        S_NLP["NLPTaskParserService"]
        S_Schedule["ScheduleCalculatorService"]
        S_Ticket["TicketManagementService"]
        S_OTP["OTPVerificationService"]
    end

    subgraph Repositories["Data Access Repositories"]
        Repo_User["UserRepository"]
        Repo_Task["TaskRepository"]
        Repo_Ticket["TicketRepository"]
    end

    R_Auth --> MW_RateLimit --> S_User
    R_Auth --> S_OTP
    R_Academic --> MW_JWT --> S_Classroom
    R_Academic --> MW_JWT --> S_Schedule
    R_Webhook --> S_NLP
    R_Tickets --> MW_JWT --> MW_RBAC --> S_Ticket

    S_User --> Repo_User
    S_Classroom --> Repo_Task
    S_NLP --> Repo_Task
    S_Ticket --> Repo_Ticket
```

---

## 5. Entity-Relationship Data Model (PostgreSQL 16)

```mermaid
erDiagram
    USERS ||--o{ PROFILES : has
    USERS ||--o{ TASKS : owns
    USERS ||--o{ TICKETS : files
    USERS ||--o{ COURSES : enrolled_in
    COURSES ||--o{ TASKS : categorizes
    TICKETS ||--o{ TICKET_COMMENTS : contains
    USERS ||--o{ AUDIT_LOGS : triggers

    USERS {
        uuid id PK
        string email UK
        string cui UK
        string role
        string phone_number UK
        datetime created_at
        datetime updated_at
    }

    PROFILES {
        uuid id PK
        uuid user_id FK
        string full_name
        string school
        string campus
        string avatar_url
    }

    COURSES {
        uuid id PK
        string classroom_course_id UK
        string name
        string section
        string schedule_json
    }

    TASKS {
        uuid id PK
        uuid user_id FK
        uuid course_id FK
        string title
        string description
        datetime due_date
        string status
        string origin
        string urgency_level
    }

    TICKETS {
        uuid id PK
        string tracking_code UK
        uuid student_id FK
        uuid assigned_secretary_id FK
        string category
        string subject
        string status
        datetime created_at
        datetime resolved_at
    }

    TICKET_COMMENTS {
        uuid id PK
        uuid ticket_id FK
        uuid author_id FK
        string message
        datetime created_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        string entity_name
        uuid entity_id
        datetime timestamp
    }
```

---

## 6. Security & Authentication Architecture

1. **Institutional Domain Enforcement:**
   * Google OAuth2 verification verifies the `hd` (hosted domain) claim.
   * Hard rejection if `hd != "unsa.edu.pe"`.
2. **Cryptographic Token Lifecycle:**
   * Access tokens: Signed RS256/HS256 JWT with 60-minute expiration.
   * Refresh tokens: Secure HTTP-only cookies with SameSite strict protection.
3. **5-Minute OTP Verification:**
   * Phone binding generates 6-digit cryptographic numeric codes (`secrets.choice`).
   * Stored in Redis with `SETEX phone_otp:<cui> 300 <code_hash>`.
   * Max 3 verification attempts before key invalidation.
4. **Role-Based Access Control (RBAC):**
   * Predefined roles: `student`, `secretary`, `admin`.
   * Route decorators enforce least-privilege access at controller entrypoints.

---

## 7. Caching & PWA Offline Strategy

* **Browser Tier (PWA):**
  * `Service Worker` implements Workbox caching policies:
    * Static UI assets: `CacheFirst` with 30-day cache lifetime.
    * Academic schedules & active tasks: `StaleWhileRevalidate` with local `IndexedDB` mirror.
  * Allows instantaneous rendering (< 500 ms) in lecture halls lacking mobile reception.
* **Server Tier (Redis 7):**
  * Academic schedule cache key: `schedule:<cui>` with 15-minute TTL.
  * Webhook idempotency key: `webhook:event:<message_id>` with 24-hour TTL to prevent duplicate task creation.
