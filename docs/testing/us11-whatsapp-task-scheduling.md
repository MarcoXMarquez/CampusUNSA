# US-11 WhatsApp task scheduling

Issue #11 implements REQ-15. A message from a linked WhatsApp account can create
a student-owned task and receive the same deadline in its confirmation.

## Execution path

1. The existing Evolution webhook validates and enqueues the version 1 event.
2. The worker reserves the delivery in Redis. It accepts direct text messages,
   including extended text. Group messages, pairing codes and unsupported
   attachments do not enter the parser.
3. The worker resolves an active student by the bound phone number. Ownership
   is stored by the UUID of the student record that holds the CUI. This also
   works for existing accounts with a verified phone but an unpopulated CUI.
   The existing parser receives the text, receipt time and enrolled course
   names, using America/Lima.
4. A complete draft creates an assignment owned by the student's existing UUID.
   The assignment uses origin `whatsapp` and stores the parser's course text.
   An exact normalized match to a unique enrollment also sets the course code.
   The worker preserves an unmatched course label without creating an enrollment.
5. The service flushes the insert, sends the prescribed confirmation through
   Evolution, and commits only when Evolution accepts it. The board displays
   WhatsApp on the row and in the detail sheet. An open board refreshes every
   15 seconds while visible and when the user returns to it.

A missing deadline triggers the parser's clarification question without creating
a task. An unlinked phone, group or unsupported message creates no task and sends
no confirmation.

## Failure and recovery

Inbound admission and background processing have separate Redis controls.
The reservation expires after 120 seconds and is recoverable if a worker stops.
A failed attempt is deferred and retried, up to three attempts. Exhausted jobs
enter `webhook:whatsapp:processing-dead-letter`. Protect this queue with the
same access and retention controls as the inbound queue. Invalid queue records
are quarantined by reason without retaining an unvalidated body.

A rejected outbound request, transport error or timeout rolls back the insert.
The student row is locked while the service rechecks ownership and completes the
transaction. A deterministic assignment ID and the existing per-student unique
constraint block duplicate tasks on replay. Redis acknowledges a successful
job only after the database commits. Evolution and PostgreSQL do not share a
transaction: a provider timeout after acceptance or an interrupted database
commit after a send can cause a repeated confirmation on retry.

## Configuration

- Run `alembic upgrade head` before starting updated backend instances.
- Set `EVOLUTION_WEBHOOK_API_KEY` for inbound authentication,
  `EVOLUTION_API_KEY` for outbound dispatch, and the instance endpoint with
  `EVOLUTION_API_URL` and `EVOLUTION_INSTANCE_NAME`.
- The backend starts the consumer when both keys are configured and
  `WHATSAPP_TASK_WORKER_ENABLED` is true. It uses the same Redis as the webhook.
  To isolate an ingestion-only environment, disable the worker explicitly.
- Use the existing parser settings for Gemini, Ollama or deterministic fallback.
- Connect the Evolution instance to WhatsApp and link a student account. See [US-09 webhook setup](us09-whatsapp-webhook.md) for the inbound header.

## Verification

```bash
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend alembic check
docker compose exec -T backend python -m pytest tests/test_whatsapp_tasks.py tests/test_whatsapp_worker.py -q
./scripts/verify.sh
```

Set `COMPLETION_TEST_DATABASE_URL` and `WHATSAPP_WEBHOOK_TEST_REDIS_URL` to
disposable test services. The integration uses real Redis and PostgreSQL and
intercepts only Evolution's outbound HTTP call. The browser test checks the
board row and detail sheet in light and dark mode. Validate a live WhatsApp
delivery in staging using a dedicated test number before enabling production.
