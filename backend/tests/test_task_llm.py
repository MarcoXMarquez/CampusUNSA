"""HTTP adapter tests use transport mocks, never external credentials or inference."""

import json

import httpx
import pytest
from pydantic import SecretStr


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["ollama", "gemini"])
async def test_provider_sends_schema_and_validates_json(provider: str) -> None:
    from app.core.config import Settings
    from app.schemas.task_parser import ParseTaskRequest
    from app.services.task_llm import StructuredLLMClient

    requests: list[httpx.Request] = []
    draft = {"title": "Lab", "course": "Compilers", "due_date": "2026-10-16T18:00:00Z"}

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        envelope = (
            {"message": {"content": json.dumps(draft)}}
            if provider == "ollama"
            else {"candidates": [{"content": {"parts": [{"text": json.dumps(draft)}]}}]}
        )
        return httpx.Response(200, json=envelope)

    settings = Settings(
        TASK_PARSER_PROVIDER=provider,
        TASK_PARSER_MODEL="test-model",
        GEMINI_API_KEY=SecretStr("test-key"),
    )
    client = StructuredLLMClient(settings, transport=httpx.MockTransport(respond))
    request = ParseTaskRequest(message="Lab for Compilers tomorrow 18:00")
    result = await client.extract(request)
    assert result.title == "Lab"
    payload = json.loads(requests[0].content)
    if provider == "ollama":
        assert payload["format"]["additionalProperties"] is False
        assert payload["stream"] is False
        assert payload["options"]["temperature"] == 0
        assert request.message in payload["messages"][-1]["content"]
    else:
        assert requests[0].headers["x-goog-api-key"] == "test-key"
        assert "test-key" not in str(requests[0].url)
        assert payload["generationConfig"]["responseMimeType"] == "application/json"
        assert "responseJsonSchema" in payload["generationConfig"]


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 429, 500])
async def test_provider_http_failures_do_not_return_a_task(status: int) -> None:
    from app.core.config import Settings
    from app.schemas.task_parser import ParseTaskRequest
    from app.services.task_llm import StructuredLLMClient

    client = StructuredLLMClient(
        Settings(TASK_PARSER_PROVIDER="ollama", TASK_PARSER_MODEL="test-model"),
        transport=httpx.MockTransport(lambda request: httpx.Response(status)),
    )
    with pytest.raises(httpx.HTTPStatusError):
        await client.extract(ParseTaskRequest(message="Lab tomorrow 18:00"))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "envelope",
    [
        {},
        {"message": {"content": "invalid"}},
        {
            "message": {
                "content": '{"title":"Lab","course":null,"due_date":"tomorrow","role":"admin"}'
            }
        },
    ],
)
async def test_malformed_outputs_are_rejected(envelope: dict[str, object]) -> None:
    from app.core.config import Settings
    from app.schemas.task_parser import ParseTaskRequest
    from app.services.task_llm import StructuredLLMClient

    client = StructuredLLMClient(
        Settings(TASK_PARSER_PROVIDER="ollama", TASK_PARSER_MODEL="test-model"),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=envelope)
        ),
    )
    with pytest.raises(ValueError):
        await client.extract(ParseTaskRequest(message="Lab tomorrow 18:00"))


@pytest.mark.parametrize(
    "provider,key,model",
    [("disabled", "", ""), ("ollama", "", ""), ("gemini", "", "test-model")],
)
def test_missing_provider_configuration_fails_explicitly(
    provider: str, key: str, model: str
) -> None:
    from app.core.config import Settings
    from app.services.task_llm import StructuredLLMClient

    with pytest.raises(ValueError):
        StructuredLLMClient(
            Settings(
                TASK_PARSER_PROVIDER=provider,
                TASK_PARSER_MODEL=model,
                GEMINI_API_KEY=key,
            )
        )
