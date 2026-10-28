# US-10: Structured Task Extraction

Issue: [#10](https://github.com/MarcoXMarquez/CampusUNSA/issues/10).

## Scope and API contract

`POST /api/v1/nlp/parse-task` accepts an authenticated, active student JWT and returns a task draft or a clarification question. It does not insert tasks, schedule notifications, or send WhatsApp messages. Those operations belong to US-11 and its callers.

```json
{
  "message": "remind me to turn in compilers lab next Friday at 18:00",
  "reference_time": "2026-10-09T10:00:00Z",
  "timezone": "UTC",
  "courses": []
}
```

With a correctly extracting LLM, the acceptance response is:

```json
{
  "status": "parsed",
  "task": {
    "title": "Compilers Lab",
    "course": "Compilers",
    "due_date": "2026-10-16T18:00:00Z"
  },
  "clarification": null,
  "source": "ollama"
}
```

The source is `ollama`, `gemini`, or `fallback`. For `buy notebook`, the status is `needs_clarification`, the deadline is null, and the question is exactly `Would you like to set a deadline for this task?`.

Requests reject unknown properties, blank messages, messages over 2,000 characters, naive reference timestamps, and invalid IANA zones with HTTP 422. Missing authentication returns 401; staff and unknown roles return 403. An enabled provider with incomplete configuration returns 503 and `PARSER_NOT_CONFIGURED`.

The reference defaults to the current UTC instant and the zone defaults to UTC, matching the issue example. Peruvian clients should explicitly send `America/Lima`. For example, local `2026-10-16 18:00` becomes `2026-10-16T23:00:00Z`. All returned deadlines have an offset and are normalized to UTC. A caller-supplied reference controls relative-date interpretation; this endpoint only produces a preview.

## Extraction pipeline

1. Validate bounded inputs with Pydantic v2.
2. Resolve recognized date evidence using the supplied reference and zone.
3. Produce a conservative regex fallback draft.
4. When enabled, request schema-constrained JSON from the configured LLM using a few-shot prompt, then validate its response again with Pydantic.
5. Override recognized deadlines with deterministic calendar arithmetic. Clear model deadlines when the message lacks date or time evidence. Restrict extracted courses to supplied course names when a course list exists.
6. Return a complete draft or a clarification question. No database write occurs.

Timeouts, HTTP failures, malformed envelopes, invalid JSON, extra output fields, and invalid model deadlines use the real fallback. No automatic retry is performed. Messages, response bodies, and credentials are not logged by the adapters. Gemini sends student text to Google when explicitly enabled; Ollama sends it to the configured local service.

## Configuration

The default is `TASK_PARSER_PROVIDER=disabled`: deterministic fallback only, with no paid API calls or model download required for CI. Choose a provider explicitly for semantic extraction.

| Variable | Meaning |
| --- | --- |
| `TASK_PARSER_PROVIDER` | `disabled`, `ollama`, or `gemini` |
| `TASK_PARSER_MODEL` | Installed Ollama model tag or supported Gemini model ID |
| `TASK_PARSER_TIMEOUT_SECONDS` | Positive timeout up to 60 seconds; default 30 |
| `OLLAMA_BASE_URL` | Default `http://ollama:11434` inside Compose |
| `GEMINI_API_KEY` | Secret required only for Gemini |

### Optional local Ollama service

From the repository root, start the optional Compose service and pull a model:

```bash
docker compose -f docker-compose.yml -f docker-compose.llm.yml --profile llm up -d ollama
docker compose -f docker-compose.yml -f docker-compose.llm.yml --profile llm exec ollama ollama pull qwen2.5:3b
```

Set these values in the untracked `.env`, then recreate the backend:

```dotenv
TASK_PARSER_PROVIDER=ollama
TASK_PARSER_MODEL=qwen2.5:3b
TASK_PARSER_TIMEOUT_SECONDS=60
OLLAMA_BASE_URL=http://ollama:11434
```

```bash
docker compose up -d backend
```

The optional service binds its host port to loopback and retains downloaded models in `ollama_models`. The small example model is a development smoke-test option; evaluate extraction quality and latency before choosing a deployment model.

### Gemini

Set the provider to `gemini`, select a Gemini Flash model supporting JSON Schema, and supply a private `GEMINI_API_KEY` in `.env`. Recreate the backend. The adapter uses `generateContent`, `responseMimeType`, and `responseJsonSchema`; the key is passed in an HTTP header. The model ID is explicit so changes to model availability do not silently select a paid service.

Gemini transport behavior is covered with mock HTTP responses. A live Gemini inference requires a developer's key and is not part of CI.

## Fallback limits

The fallback recognizes ISO date-times with explicit offsets or local ISO date-times, ISO calendar dates plus a clock, today/tomorrow and their Spanish equivalents, and English/Spanish weekdays including `prox vie`. It supports 24-hour clocks and AM/PM. Recognized conflicting dates, invalid dates, and ambiguous/nonexistent daylight-saving times request clarification.

Fallback titles retain the student's spelling after removing reminder/date phrases. A course is extracted only from an explicit connector such as `for Compilers` or `de SO` and a supplied known-course list. Thus fallback output can differ in capitalization and course recognition from the semantic LLM acceptance example. It deliberately asks for clarification for unsupported date grammar rather than guessing a deadline. Natural language remains model-dependent beyond these deterministic boundaries.

## Validation and evidence

The fixture file contains 20 representative, authored messages covering English/Spanish, informal abbreviations, offsets, relative dates, local calendars, missing information, and invalid/conflicting deadlines. These are synthetic test inputs, not a claimed collection from real students. Replace or supplement them with consented, anonymized pilot messages when available.

All 20 fixture cases exercise the actual fallback. Separate tests verify the exact issue acceptance contract with a stubbed extraction provider. HTTP transport tests verify schema requests and rejected responses for both providers. These automated tests establish deterministic behavior and integration contracts; they do not measure live LLM accuracy on 20 messages.

Additional tests cover institutional session authorization, no persistence, hallucinated deadlines/courses, daylight-saving transitions, and safe provider configuration failures.

Live local smoke verification used Ollama 0.40.11 with `qwen2.5:3b`: the exact issue example produced `Compilers Lab`, `Compilers`, and `2026-10-16T18:00:00Z`; a Spanish `SO` example in `America/Lima` returned `2026-10-10T23:00:00Z`; and `buy notebook` returned the required clarification. All three responses came from Ollama, without fallback. This is a three-case integration smoke, not a 20-message model accuracy benchmark.

The initial 1.5B smoke omitted the course. A 3B model also omitted it when an empty course catalog was sent. The adapter now omits an empty catalog from model context and explicitly permits inference when no catalog exists; nonempty catalogs remain intact and restrictive. The successful smoke used this corrected context. Unit endpoint tests disable live providers explicitly even when a developer enables one locally.

```bash
docker compose exec backend python -m pytest tests/test_task_parser.py tests/test_task_llm.py -v
docker compose exec backend python -m pytest tests/ -v --cov=app --cov-branch --cov-report=term-missing --cov-fail-under=80
docker compose exec backend ruff check app tests
bash scripts/verify.sh
```

## Source map and provider references

- `app/schemas/task_parser.py`: request, draft, and response contracts.
- `app/services/task_dates.py`: date evidence, local calendars, and UTC normalization.
- `app/services/task_llm.py`: few-shot prompt and typed HTTP provider adapters.
- `app/services/task_parser.py`: fallback, provider orchestration, and clarification policy.
- `app/api/v1/nlp.py`: authenticated preview endpoint and provider dependency.
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs).
- [Gemini generation API](https://ai.google.dev/api/generate-content).
