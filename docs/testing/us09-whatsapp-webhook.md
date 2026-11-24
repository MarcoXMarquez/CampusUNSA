# US-09 WhatsApp Webhook Ingestion

## Scope and contracts

Issue #9 implements REQ-13. Evolution API sends authenticated events to
`POST /api/v1/webhooks/whatsapp`. The request header `apikey` must match
`EVOLUTION_WEBHOOK_API_KEY`. Use a separate inbound secret from the gateway management key.
An empty configured secret disables ingestion with HTTP 503.

The route accepts Evolution v2 `messages.upsert` events (or `MESSAGES_UPSERT`)
for `EVOLUTION_INSTANCE_NAME`. A message requires a nonempty instance, key ID,
remote JID, a boolean `fromMe`, and a nonempty message object. Text, extended text,
and media message metadata remain available to the later worker.
No PostgreSQL lookup, NLP inference, or outbound message runs during acknowledgment.

## Acceptance outcomes

| Condition | HTTP status | Response status or code |
| --- | --- | --- |
| New inbound message durably queued | 200 | queued |
| Retry with the same instance, remote JID and message ID | 200 | duplicate |
| Bot echo or unrelated event | 200 | ignored |
| Malformed authenticated event durably quarantined | 200 | dead_lettered |
| Missing or incorrect header | 401 | INVALID_WEBHOOK_KEY |
| Missing configured secret | 503 | WEBHOOK_NOT_CONFIGURED |
| Redis unavailable or exceeding its admission timeout | 503 | WEBHOOK_QUEUE_UNAVAILABLE |
| Body larger than 256 KiB | 413 | WEBHOOK_TOO_LARGE |

Authenticated invalid events receive a successful acknowledgment only after quarantine,
avoiding repeated poison deliveries. Invalid JSON cannot be safely redacted, so its
dead-letter record contains a SHA-256 body digest instead of unparsed credentials.
Valid JSON records exclude provider API keys and nested authentication metadata.
The key in the JSON body never authenticates a request.

## Queue lifecycle

- Pending list is `webhook:whatsapp:pending`.
- Dead-letter list is `webhook:whatsapp:dead-letter`.
- A version 1 processing record contains `received_at` and the normalized `payload`.
- Deduplication uses `webhook:event:<sha256(instance + NUL + remoteJid + NUL + messageId)>`
  with exactly 86,400 seconds of TTL.
- A Redis Lua script checks deduplication, pushes the record, and stores the marker
  in one atomic execution. A wrong queue type does not create the marker.
- The [US-11 worker](us11-whatsapp-task-scheduling.md) claims the oldest pending
  record atomically and acknowledges it after processing. Expired claims can be
  recovered after a restart.
- Pending and dead-letter records have no automatic expiry or trimming.
  Operators must restrict Redis access and establish retention for quarantined data.
- Redis AOF persistence is already enabled in the development Compose stack.
  A successful Redis write is the webhook admission boundary.
- Redis dispatch has a 250ms timeout with 200ms connection/socket limits. HTTP 503 requests can safely be retried.
  The 200ms acceptance target is verified under mocked concurrent load.

## Evolution v2 setup

Set `EVOLUTION_WEBHOOK_API_KEY` in the backend environment. Configure the same value
as the `apikey` header in the per-instance webhook settings. The backend Compose
service receives the inbound secret and instance name from environment variables.

Send this configuration to the gateway instance webhook setup endpoint
(`POST /webhook/set/campusunsa` on supported Evolution v2 builds):

```json
{
  "webhook": {
    "enabled": true,
    "url": "http://backend:8000/api/v1/webhooks/whatsapp",
    "headers": {"apikey": "<same-independent-inbound-secret>"},
    "byEvents": false,
    "base64": false,
    "events": ["MESSAGES_UPSERT"]
  }
}
```

Use the deployment's HTTPS backend URL when the gateway is outside the Compose
network. Confirm the installed gateway exposes custom webhook headers. The
`apikey` used to administer Evolution is distinct from the configured inbound header.

Example delivery:

```json
{
  "event": "messages.upsert",
  "instance": "campusunsa",
  "data": {
    "key": {
      "id": "provider-message-id",
      "remoteJid": "51999888777@s.whatsapp.net",
      "fromMe": false
    },
    "message": {"conversation": "Prepare the report"}
  }
}
```

## Verification

```bash
docker compose exec backend python -m pytest tests/test_whatsapp_webhook.py -v
docker compose exec backend python -m pytest tests/test_whatsapp_webhook_redis.py -v
docker compose exec backend ruff check app tests
./scripts/verify.sh
```

The real Redis integration test requires `WHATSAPP_WEBHOOK_TEST_REDIS_URL` pointing
to a disposable Redis database. It uses unique keys, removes its records, checks
40 simultaneous deliveries, verifies the 24-hour TTL, and retries after a failed
queue write. CI supplies a Redis 7 service for this test.

The continuous 1,000-user harness includes both authenticated ingestion and
unauthenticated rejection. Both exercise the real route; accepted deliveries
write to the isolated Redis queue. Existing load-gate thresholds remain applicable.

## Provider references

The implementation follows Evolution's emitted `event`, `instance`, `data`
envelope and custom per-instance header support.

- [Evolution webhook controller](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/integrations/event/webhook/webhook.controller.ts)
- [Evolution webhook schema](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/integrations/event/webhook/webhook.schema.ts)
