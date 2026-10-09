---
name: whatsapp-evolution-orchestrator
description: Omnichannel WhatsApp integration orchestrator for Evolution API, Baileys, Redis OTP queues, and FastAPI in CampusUNSA. Enforces strict 300-second OTP TTLs, webhook handling, and conversational state machines.
---

# WhatsApp Evolution API Orchestrator — CampusUNSA

## 1. Overview and Mission

The `whatsapp-evolution-orchestrator` skill provides comprehensive engineering directives for connecting the CampusUNSA platform with WhatsApp via the Evolution API (Node.js / Baileys gateway), managing Redis OTP queues, and handling incoming/outgoing messages.

## 2. Inviolable Constraints

1. **OTP Expiration (Strict 300-Second TTL):**
   - WhatsApp pairing verification codes stored in Redis MUST expire after exactly 300 seconds (5 minutes). Use `SETEX otp:{phone_number} 300 {code}`.
2. **Zero Emojis:**
   - Automated system messages, SMS/WhatsApp templates, error payloads, and code must not contain emojis.
3. **English Only in Code Artifacts:**
   - Webhook schemas, Redis keys, service handlers, and comments must be in standard English.
4. **Resilient Webhook Processing:**
   - Webhook endpoints must process incoming messages asynchronously to prevent blocking Evolution API socket workers.

## 3. Architecture & Integration Topology

```
[Student Device]
       │ (WhatsApp Message)
       ▼
[Evolution API Container: 8080]
       │ (HTTP POST Webhook)
       ▼
[FastAPI Backend: /api/v1/webhooks/whatsapp]
       │
       ├───► Redis 7 (OTP validation, TTL 300s, Rate Limiting)
       └───► PostgreSQL 16 (User and Profile Lookup)
```

## 4. OTP Lifecycle & Redis Management

### 4.1 OTP Generation and Storage Pattern
```python
import secrets
from redis import Redis

def generate_and_store_otp(redis_client: Redis, phone_number: str) -> str:
    """
    Generates a secure 6-digit OTP and stores it in Redis with a strict 300-second TTL.
    """
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    redis_key = f"otp:phone:{phone_number}"
    # TTL: 300 seconds (5 minutes)
    redis_client.setex(name=redis_key, time=300, value=otp_code)
    return otp_code
```

### 4.2 OTP Verification Pattern
```python
from redis import Redis

def verify_and_consume_otp(redis_client: Redis, phone_number: str, submitted_code: str) -> bool:
    """
    Verifies the submitted OTP against Redis and invalidates it immediately upon success.
    """
    redis_key = f"otp:phone:{phone_number}"
    stored_code = redis_client.get(redis_key)
    if not stored_code:
        return False
    if stored_code.decode("utf-8") == submitted_code:
        redis_client.delete(redis_key)
        return True
    return False
```

## 5. Evolution API Client Pattern

```python
import httpx
from app.core.config import settings

async def send_whatsapp_text(phone_number: str, message_text: str) -> bool:
    """
    Dispatches a text message through the local Evolution API container.
    """
    payload = {
        "number": phone_number,
        "text": message_text,
    }
    headers = {
        "apikey": settings.SECRET_KEY,
        "Content-Type": "application/json",
    }
    url = f"http://evolution:8080/message/sendText/campusunsa"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        return response.status_code == 200 or response.status_code == 201
```

## 6. Testing Strategy

* Unit test OTP expiration and boundary conditions using mocked Redis clients (`mock_redis_client`).
* Simulate Evolution API webhook payloads via `TestClient.post("/api/v1/webhooks/whatsapp", json=...)`.
