"""US-11 acceptance tests against the actual academic board and relational storage."""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.classroom import ClassroomAssignment, CourseCatalog, UserCourseEnrollment
from app.models.user import User
from app.schemas.task_parser import ParseTaskResponse, TaskDraft
from app.schemas.webhook import QueuedWhatsAppEvent
from app.services.tasks.whatsapp import TaskService, WhatsAppConfirmationError
import test_assignment_completion as board_tests

authorization = board_tests.authorization
completion_client = board_tests.completion_client
completion_db = board_tests.completion_db


@pytest.fixture
def student(completion_db: Session) -> User:
    student = User(
        email="whatsapp-owner@unsa.edu.pe", cui="20260001", phone_number="+51999888777"
    )
    completion_db.add(student)
    completion_db.flush()
    completion_db.add(
        CourseCatalog(
            code="COMP", curriculum_year=2025, official_name="Compilers",
            normalized_name="compilers", category="REQ", study_year=3,
            semester=2, department="Computer Science", credits=4,
        )
    )
    completion_db.flush()
    completion_db.add(UserCourseEnrollment(user_id=student.id, course_code="COMP"))
    completion_db.commit()
    return student


def delivery(
    text: str = "Submit Compilers Lab on Oct 16 at 18:00",
    jid: str = "51999888777@s.whatsapp.net",
) -> QueuedWhatsAppEvent:
    return QueuedWhatsAppEvent.model_validate({
        "received_at": "2026-10-09T10:00:00Z",
        "payload": {
            "event": "messages.upsert", "instance": "campusunsa",
            "data": {
                "key": {"id": "delivery-1", "remoteJid": jid, "fromMe": False},
                "message": {"conversation": text},
            },
        },
    })


def parsed(course: str = "Compilers") -> AsyncMock:
    parser = AsyncMock()
    parser.parse.return_value = ParseTaskResponse(
        status="parsed", clarification=None, source="fallback",
        task=TaskDraft(
            title="Compilers Lab", course=course,
            due_date=datetime(2026, 10, 16, 23, 0, tzinfo=timezone.utc),
        ),
    )
    return parser


def test_creates_one_task_confirms_and_exposes_it_on_the_students_board(
    completion_db: Session, completion_client: TestClient, student: User,
) -> None:
    owner_headers = authorization(student.id)
    other = User(email="other@unsa.edu.pe", cui=str(uuid4())[:8])
    completion_db.add(other)
    completion_db.flush()
    other_headers = authorization(other.id)
    completion_db.commit()

    parser = parsed()
    gateway = AsyncMock()
    gateway.send_text.return_value = True
    service = TaskService(completion_db, parser, gateway)
    assert asyncio.run(service.create_from_whatsapp(delivery())) == "created"
    assert asyncio.run(service.create_from_whatsapp(delivery())) == "duplicate"
    gateway.send_text.assert_awaited_once_with(
        "+51999888777", "Task scheduled: Compilers Lab due Oct 16, 18:00"
    )
    parser.parse.assert_awaited_once()
    assert parser.parse.call_args.args[0].courses == ["Compilers"]

    path = "/api/v1/courses/assignments"
    response = completion_client.get(path, headers=owner_headers)
    assert response.status_code == 200
    (task,) = response.json()
    assert task["title"] == "Compilers Lab"
    assert task["course_code"] == "COMP"
    assert task["origin"] == "whatsapp"
    # SQLite discards offsets, whereas PostgreSQL preserves UTC.
    assert datetime.fromisoformat(task["due_date"]).replace(tzinfo=timezone.utc) == (
        datetime(2026, 10, 16, 23, 0, tzinfo=timezone.utc)
    )
    assert completion_client.get(path, headers=other_headers).json() == []


@pytest.mark.parametrize("provider_failure", [False, RuntimeError("provider error")])
def test_failed_confirmation_rolls_back_then_retries_cleanly(
    completion_db: Session, student: User, provider_failure: bool | Exception,
) -> None:
    gateway = AsyncMock()
    gateway.send_text.side_effect = [provider_failure, True]
    service = TaskService(completion_db, parsed(), gateway)
    with pytest.raises(WhatsAppConfirmationError):
        asyncio.run(service.create_from_whatsapp(delivery()))
    with completion_db.begin():
        assert completion_db.scalar(select(ClassroomAssignment)) is None

    assert asyncio.run(service.create_from_whatsapp(delivery())) == "created"
    with completion_db.begin():
        assert len(completion_db.scalars(select(ClassroomAssignment)).all()) == 1
    assert gateway.send_text.await_count == 2


@pytest.mark.parametrize("jid", ["51911112222@s.whatsapp.net", "51999888777@g.us"])
def test_unlinked_or_group_sender_cannot_create_a_task(
    completion_db: Session, student: User, jid: str,
) -> None:
    gateway = AsyncMock()
    parser = parsed()
    service = TaskService(completion_db, parser, gateway)
    assert asyncio.run(service.create_from_whatsapp(delivery(jid=jid))) == "ignored"
    parser.parse.assert_not_awaited()
    gateway.send_text.assert_not_awaited()
    assert completion_db.scalar(select(ClassroomAssignment)) is None


def test_ambiguous_message_requests_clarification_without_creating_a_task(
    completion_db: Session, student: User,
) -> None:
    gateway = AsyncMock()
    gateway.send_text.return_value = True
    parser = AsyncMock()
    parser.parse.return_value = ParseTaskResponse(
        status="needs_clarification",
        clarification="Would you like to set a deadline for this task?",
        task=TaskDraft(title="Buy notebook", course=None, due_date=None),
        source="fallback",
    )
    service = TaskService(completion_db, parser, gateway)
    assert asyncio.run(service.create_from_whatsapp(delivery("Buy notebook"))) == "clarification"
    gateway.send_text.assert_awaited_once_with(
        "+51999888777", "Would you like to set a deadline for this task?"
    )
    assert completion_db.scalar(select(ClassroomAssignment)) is None


def test_unmatched_course_is_retained_as_a_label_without_fabricating_enrollment(
    completion_db: Session, completion_client: TestClient, student: User,
) -> None:
    headers = authorization(student.id)
    completion_db.commit()
    gateway = AsyncMock()
    gateway.send_text.return_value = True
    service = TaskService(completion_db, parsed("Advanced Compilers"), gateway)
    assert asyncio.run(service.create_from_whatsapp(delivery())) == "created"
    (task,) = completion_client.get("/api/v1/courses/assignments", headers=headers).json()
    assert task["course_code"] is None
    assert task["reported_course"] == "Advanced Compilers"


def test_existing_student_without_cui_uses_the_verified_account_binding(
    completion_db: Session, completion_client: TestClient, student: User,
) -> None:
    user_id = student.id
    student.cui = None
    completion_db.commit()
    gateway = AsyncMock()
    gateway.send_text.return_value = True
    service = TaskService(completion_db, parsed(), gateway)
    assert asyncio.run(service.create_from_whatsapp(delivery())) == "created"
    response = completion_client.get(
        "/api/v1/courses/assignments", headers=authorization(user_id)
    )
    assert response.status_code == 200
    assert [task["origin"] for task in response.json()] == ["whatsapp"]
