"""US-10: deterministic extraction, validation and provider failure boundaries."""

import json
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError


CASES = json.loads(
    (Path(__file__).parent / "fixtures/task_messages.json").read_text(encoding="utf-8")
)


@pytest.fixture(autouse=True)
def isolate_live_provider_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unit endpoint tests must never infer against a developer's enabled provider."""
    from app.api.v1 import nlp

    monkeypatch.setattr(nlp.settings, "TASK_PARSER_PROVIDER", "disabled")


def test_parse_endpoint_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/v1/nlp/parse-task", json={"message": "buy notebook"})
    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("case", CASES, ids=[case["id"] for case in CASES])
async def test_twenty_student_messages_without_llm(case: dict[str, str]) -> None:
    from app.schemas.task_parser import ParseTaskRequest
    from app.services.task_parser import NLPTaskParserService

    request = ParseTaskRequest(
        message=case["message"],
        reference_time=case.get("reference_time", "2026-10-09T10:00:00Z"),
        timezone=case.get("timezone", "UTC"),
        courses=["Compilers", "Compiladores", "SO", "BD"],
    )
    result = await NLPTaskParserService().parse(request)
    assert result.source == "fallback"
    if "clarification" in case:
        assert result.status == "needs_clarification"
        assert result.clarification == case["clarification"]
    else:
        assert result.status == "parsed"
        assert result.task.title == case["title"]
        assert result.task.course == case["course"]
        assert result.task.due_date == datetime.fromisoformat(
            case["due_date"].replace("Z", "+00:00")
        )


@pytest.mark.asyncio
async def test_issue_acceptance_example_with_structured_llm() -> None:
    from app.schemas.task_parser import ParseTaskRequest, TaskDraft
    from app.services.task_parser import NLPTaskParserService

    provider = AsyncMock()
    provider.name = "ollama"
    provider.extract.return_value = TaskDraft(
        title="Compilers Lab", course="Compilers", due_date="2026-10-16T18:00:00Z"
    )
    request = ParseTaskRequest(
        message="remind me to turn in compilers lab next Friday at 18:00",
        reference_time="2026-10-09T10:00:00Z",
        timezone="UTC",
    )
    result = await NLPTaskParserService(provider).parse(request)
    assert result.status == "parsed"
    assert result.source == "ollama"
    assert result.task.model_dump(mode="json") == {
        "title": "Compilers Lab",
        "course": "Compilers",
        "due_date": "2026-10-16T18:00:00Z",
    }
    provider.extract.assert_awaited_once_with(request)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error", [httpx.ReadTimeout("offline"), ValueError("invalid JSON")]
)
async def test_provider_failure_uses_real_fallback(error: Exception) -> None:
    from app.schemas.task_parser import ParseTaskRequest
    from app.services.task_parser import NLPTaskParserService

    provider = AsyncMock()
    provider.name = "ollama"
    provider.extract.side_effect = error
    result = await NLPTaskParserService(provider).parse(
        ParseTaskRequest(
            message="submit lab for Compilers 2026-10-16T18:00:00Z",
            courses=["Compilers"],
        )
    )
    assert result.status == "parsed"
    assert result.source == "fallback"


@pytest.mark.asyncio
async def test_hallucinated_course_requires_clarification() -> None:
    from app.schemas.task_parser import ParseTaskRequest, TaskDraft
    from app.services.task_parser import NLPTaskParserService

    provider = AsyncMock()
    provider.name = "gemini"
    provider.extract.return_value = TaskDraft(
        title="Lab", course="Invented Course", due_date="2026-10-16T18:00:00Z"
    )
    result = await NLPTaskParserService(provider).parse(
        ParseTaskRequest(message="Lab 2026-10-16T18:00:00Z", courses=["Compilers"])
    )
    assert result.status == "needs_clarification"
    assert result.task.course is None


@pytest.mark.parametrize("value", ["2026-10-16T18:00:00", 1792173600, "not-a-date"])
def test_untrusted_dates_need_explicit_offsets(value: object) -> None:
    from app.schemas.task_parser import TaskDraft

    with pytest.raises(ValidationError):
        TaskDraft(title="Lab", course=None, due_date=value)


@pytest.mark.parametrize(
    "changes",
    [
        {"message": "   "},
        {"message": "x" * 2001},
        {"timezone": "Invalid/Zone"},
        {"reference_time": "2026-10-09T10:00:00"},
        {"role": "admin"},
    ],
)
def test_invalid_inputs_are_rejected(changes: dict[str, object]) -> None:
    from app.schemas.task_parser import ParseTaskRequest

    payload = {"message": "buy notebook", **changes}
    with pytest.raises(ValidationError):
        ParseTaskRequest.model_validate(payload)


@pytest.mark.asyncio
@pytest.mark.parametrize("date", ["2026-03-08 02:30", "2026-11-01 01:30"])
async def test_nonexistent_or_ambiguous_dst_time_is_not_guessed(date: str) -> None:
    from app.schemas.task_parser import ParseTaskRequest
    from app.services.task_parser import NLPTaskParserService

    result = await NLPTaskParserService().parse(
        ParseTaskRequest(message=f"submit lab {date}", timezone="America/New_York")
    )
    assert result.status == "needs_clarification"
    assert result.task.due_date is None


def test_authenticated_parser_does_not_persist_tasks(
    client: TestClient, mock_db_session: MagicMock
) -> None:
    from app.api.v1.auth import _resolve_authenticated_user
    from app.main import app
    from app.models.user import User

    app.dependency_overrides[_resolve_authenticated_user] = lambda: User(
        role="student", is_active=True
    )
    try:
        response = client.post(
            "/api/v1/nlp/parse-task",
            json={
                "message": "submit lab for SO 2026-10-16T18:00:00Z",
                "courses": ["SO"],
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "parsed"
        mock_db_session.commit.assert_not_called()
        mock_db_session.add.assert_not_called()
    finally:
        app.dependency_overrides.pop(_resolve_authenticated_user, None)


@pytest.mark.parametrize("provider", ["disabled", "ollama", "gemini"])
def test_parser_dependency_uses_explicit_provider(
    monkeypatch: pytest.MonkeyPatch, provider: str
) -> None:
    from app.api.v1 import nlp
    from app.core.config import Settings

    monkeypatch.setattr(
        nlp,
        "settings",
        Settings(
            TASK_PARSER_PROVIDER=provider,
            TASK_PARSER_MODEL="test-model",
            GEMINI_API_KEY="test-key",
        ),
    )
    parser = nlp.get_task_parser()
    if provider == "disabled":
        assert parser.provider is None
    else:
        assert parser.provider is not None
        assert parser.provider.name == provider


def test_incomplete_enabled_provider_returns_safe_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.v1 import nlp
    from app.api.v1.auth import _resolve_authenticated_user
    from app.core.config import Settings
    from app.main import app
    from app.models.user import User

    monkeypatch.setattr(
        nlp, "settings", Settings(TASK_PARSER_PROVIDER="ollama", TASK_PARSER_MODEL="")
    )
    app.dependency_overrides[_resolve_authenticated_user] = lambda: User(
        role="student", is_active=True
    )
    try:
        response = client.post(
            "/api/v1/nlp/parse-task", json={"message": "buy notebook"}
        )
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "PARSER_NOT_CONFIGURED"
    finally:
        app.dependency_overrides.pop(_resolve_authenticated_user, None)


def test_numeric_date_string_is_not_an_iso_deadline() -> None:
    from app.schemas.task_parser import TaskDraft

    with pytest.raises(ValidationError):
        TaskDraft(title="Lab", course=None, due_date="1792173600")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "message",
    [
        "Lab 2026-10-16T18:00:00Z or tomorrow at 12:00",
        "Lab 2026-10-16T18:00:00-05",
    ],
)
async def test_mixed_or_malformed_deadline_is_not_silently_accepted(
    message: str,
) -> None:
    from app.schemas.task_parser import ParseTaskRequest
    from app.services.task_parser import NLPTaskParserService

    result = await NLPTaskParserService().parse(ParseTaskRequest(message=message))
    assert result.status == "needs_clarification"
    assert result.task.due_date is None


@pytest.mark.asyncio
async def test_missing_deadline_cannot_be_invented_by_model() -> None:
    from app.schemas.task_parser import ParseTaskRequest, TaskDraft
    from app.services.task_parser import NLPTaskParserService

    provider = AsyncMock()
    provider.name = "ollama"
    provider.extract.return_value = TaskDraft(
        title="Buy notebook", course=None, due_date="2026-10-16T18:00:00Z"
    )
    result = await NLPTaskParserService(provider).parse(
        ParseTaskRequest(message="buy notebook")
    )
    assert result.status == "needs_clarification"
    assert result.task.due_date is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "message,reference,zone,expected",
    [
        (
            "Lab 2026-10-16 at 18:00",
            "2026-10-09T10:00:00Z",
            "UTC",
            "2026-10-16T18:00:00+00:00",
        ),
        (
            "Lab tomorrow at 18:00",
            "2026-10-09T03:00:00Z",
            "America/Lima",
            "2026-10-09T23:00:00+00:00",
        ),
        (
            "Lab 2026-07-01 14:00",
            "2026-06-01T10:00:00Z",
            "Europe/Madrid",
            "2026-07-01T12:00:00+00:00",
        ),
    ],
)
async def test_deadlines_respect_local_calendar(
    message: str, reference: str, zone: str, expected: str
) -> None:
    from app.schemas.task_parser import ParseTaskRequest
    from app.services.task_parser import NLPTaskParserService

    result = await NLPTaskParserService().parse(
        ParseTaskRequest(message=message, reference_time=reference, timezone=zone)
    )
    assert result.task.due_date == datetime.fromisoformat(expected)


@pytest.mark.asyncio
async def test_fractional_iso_timestamp_preserves_explicit_offset() -> None:
    from app.schemas.task_parser import ParseTaskRequest
    from app.services.task_parser import NLPTaskParserService

    result = await NLPTaskParserService().parse(
        ParseTaskRequest(
            message="Lab 2026-10-16T18:00:00.123456Z", timezone="America/Lima"
        )
    )
    assert result.task.due_date == datetime.fromisoformat(
        "2026-10-16T18:00:00.123456+00:00"
    )


@pytest.mark.parametrize("role", ["secretary", "admin", "unknown"])
def test_parser_only_allows_student_role(client: TestClient, role: str) -> None:
    from app.api.v1.auth import _resolve_authenticated_user
    from app.main import app
    from app.models.user import User

    app.dependency_overrides[_resolve_authenticated_user] = lambda: User(
        role=role, is_active=True
    )
    try:
        assert (
            client.post(
                "/api/v1/nlp/parse-task", json={"message": "buy notebook"}
            ).status_code
            == 403
        )
    finally:
        app.dependency_overrides.pop(_resolve_authenticated_user, None)
