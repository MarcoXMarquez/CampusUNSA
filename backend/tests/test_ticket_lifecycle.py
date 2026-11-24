"""US-13 acceptance contracts for ticket escalation and access."""

import re
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.models.user import User, UserProfile
import test_rbac as rbac

ticket_db = rbac.ticket_db
ticket_client = rbac.ticket_client
HEAD = "/api/v1/tickets"


def seed(db: Session, role: str, faculty: str | None, cui: str | None = None) -> User:
    user = User(email=f"{uuid4()}@unsa.edu.pe", role=role, cui=cui)
    if faculty:
        user.profile = UserProfile(full_name="Test Account", faculty=faculty)
    db.add(user)
    db.commit()
    return user


def create(client: TestClient, student: User, **values: object) -> dict:
    response = client.post(
        HEAD, headers=rbac.headers_for(student), json={
            "subject": "Enrollment correction", "description": "My recorded course is incorrect.",
            "confirmed": True, "request_id": str(uuid4()), **values,
        },
    )
    assert response.status_code == 201, response.json()
    return response.json()


def test_escalation_creates_auditable_ticket_and_deduplicates_retries(
    ticket_client: TestClient, ticket_db: Session,
) -> None:
    student = seed(ticket_db, "student", "Engineering", "20260017")
    request_id = str(uuid4())
    first = create(ticket_client, student, request_id=request_id)
    assert first["status"] == "OPEN"
    assert re.fullmatch(r"TICK-\d{4}-[A-Z0-9]{4}", first["tracking_code"])
    assert create(ticket_client, student, request_id=request_id)["id"] == first["id"]
    response = ticket_client.get(f"{HEAD}/{first['id']}", headers=rbac.headers_for(student))
    assert response.status_code == 200
    assert [entry["to_status"] for entry in response.json()["audit"]] == ["OPEN"]


def test_requires_explicit_confirmation_and_blocks_cross_student_reads(
    ticket_client: TestClient, ticket_db: Session,
) -> None:
    student = seed(ticket_db, "student", "Engineering", "20260018")
    stranger = seed(ticket_db, "student", "Engineering", "20260019")
    response = ticket_client.post(HEAD, headers=rbac.headers_for(student), json={
        "subject": "An administrative issue", "description": "Explain the situation.",
        "confirmed": False, "request_id": str(uuid4()),
    })
    assert response.status_code == 422
    item = create(ticket_client, student)
    assert ticket_client.get(f"{HEAD}/{item['id']}", headers=rbac.headers_for(stranger)).status_code == 404
    assert ticket_client.patch(f"{HEAD}/{item['id']}", headers=rbac.headers_for(student),
                               json={"status":"IN_REVIEW"}).status_code == 403


def test_filters_by_faculty_and_cui_and_prevents_cross_faculty_writes(
    ticket_client: TestClient, ticket_db: Session,
) -> None:
    a = seed(ticket_db, "student", "Engineering", "20260020")
    b = seed(ticket_db, "student", "Arts", "20260021")
    staff = seed(ticket_db, "secretary", " engineering ")
    no_faculty = seed(ticket_db, "secretary", None)
    first, second = create(ticket_client, a), create(ticket_client, b)
    headers = rbac.headers_for(staff)
    for query, ids in [({}, [first["id"]]), ({"cui": "20260020"}, [first["id"]]),
                       ({"faculty": "Arts"}, [])]:
        response = ticket_client.get(f"{HEAD}/all", params=query, headers=headers)
        assert response.status_code == 200
        assert [row["id"] for row in response.json()] == ids
    assert ticket_client.get(f"{HEAD}/all", headers=rbac.headers_for(no_faculty)).json() == []
    assert ticket_client.patch(f"{HEAD}/{second['id']}", headers=headers,
                               json={"status":"IN_REVIEW"}).status_code == 404


def test_terminal_resolution_creates_a_student_notification_and_dispatches_whatsapp(
    ticket_client: TestClient, ticket_db: Session,
) -> None:
    from app.models.ticket import TicketAuditEvent, TicketNotification
    from app.services.ticket_notifications import dispatch_ticket_notification

    student = seed(ticket_db, "student", "Engineering", "20260022")
    student.phone_number = "+51999900111"
    ticket_db.commit()
    staff = seed(ticket_db, "secretary", "Engineering")
    item = create(ticket_client, student)
    path = f"{HEAD}/{item['id']}"
    headers = rbac.headers_for(staff)
    assert ticket_client.patch(path, headers=headers,
                               json={"status":"RESOLVED", "resolution":"Approved"}).status_code == 409
    assert ticket_client.patch(path, headers=headers, json={"status":"IN_REVIEW"}).status_code == 200
    assert ticket_client.patch(path, headers=headers, json={"status":"RESOLVED"}).status_code == 422
    result = ticket_client.patch(path, headers=headers,
                                 json={"status":"RESOLVED", "resolution":"Correction approved."})
    assert result.status_code == 200
    assert ticket_client.patch(path, headers=headers, json={"status":"OPEN"}).status_code == 409
    updates = ticket_client.get(f"{HEAD}/notifications", headers=rbac.headers_for(student)).json()
    assert [entry["tracking_code"] for entry in updates] == [item["tracking_code"]]
    assert ticket_client.get(f"{HEAD}/notifications", headers=rbac.headers_for(staff)).status_code == 403

    gateway = AsyncMock()
    gateway.send_text.return_value = True
    assert dispatch_ticket_notification(ticket_db, gateway)
    gateway.send_text.assert_awaited_once()
    assert item["tracking_code"] in gateway.send_text.await_args.args[1]
    assert gateway.send_text.await_args.args[0] == "+51999900111"
    assert not dispatch_ticket_notification(ticket_db, gateway)
    assert ticket_db.scalar(select(TicketNotification)).whatsapp_sent_at is not None

    audit = ticket_db.scalars(select(TicketAuditEvent).order_by(TicketAuditEvent.id)).all()
    assert len(audit) == 3
    with pytest.raises(DBAPIError), ticket_db.begin_nested():
        ticket_db.execute(update(TicketAuditEvent).values(to_status="CLOSED"))
    with pytest.raises(DBAPIError), ticket_db.begin_nested():
        ticket_db.execute(delete(TicketAuditEvent))
    assert [record.to_status for record in audit] == ["OPEN", "IN_REVIEW", "RESOLVED"]


def test_withdrawal_keeps_audit_and_is_only_available_before_review(
    ticket_client: TestClient, ticket_db: Session,
) -> None:
    student = seed(ticket_db, "student", "Arts")
    other = seed(ticket_db, "student", "Arts")
    staff = seed(ticket_db, "secretary", "Arts")
    item = create(ticket_client, student)
    path = f"{HEAD}/{item['id']}"
    student_headers = rbac.headers_for(student)

    assert ticket_client.delete(path, headers=rbac.headers_for(other)).status_code == 404
    assert ticket_client.delete(path, headers=student_headers).status_code == 204
    assert ticket_client.delete(path, headers=student_headers).status_code == 204
    ticket = ticket_client.get(path, headers=student_headers).json()
    assert [event["to_status"] for event in ticket["audit"]] == ["OPEN", "CLOSED"]
    assert ticket_client.get(f"{HEAD}/mine", headers=student_headers).json()[0]["id"] == item["id"]
    assert ticket_client.get(f"{HEAD}/mine", headers=rbac.headers_for(other)).json() == []
    assert ticket_client.patch(path, headers=rbac.headers_for(staff), json={"status": "OPEN"}).status_code == 409

    reviewing = create(ticket_client, student)
    path = f"{HEAD}/{reviewing['id']}"
    assert ticket_client.patch(path, headers=rbac.headers_for(staff), json={"status": "IN_REVIEW"}).status_code == 200
    assert ticket_client.delete(path, headers=student_headers).status_code == 409


def test_routing_restricts_student_to_a_valid_destination(
    ticket_client: TestClient, ticket_db: Session,
) -> None:
    student = seed(ticket_db, "student", None)
    staff = seed(ticket_db, "secretary", "Science")
    disabled_staff = seed(ticket_db, "secretary", "Engineering")
    disabled_staff.is_active = False
    ticket_db.commit()
    headers = rbac.headers_for(student)
    assert ticket_client.get(f"{HEAD}/routing", headers=headers).json() == {
        "faculty": None, "alternatives": ["Science"],
    }
    payload = {
        "subject": "Enrollment correction", "description": "My course list is incorrect.",
        "confirmed": True, "request_id": str(uuid4()),
    }
    assert ticket_client.post(HEAD, headers=headers, json=payload).status_code == 422
    assert ticket_client.post(HEAD, headers=headers, json={**payload, "faculty": "Engineering"}).status_code == 422
    ticket = create(ticket_client, student, faculty=" science ")
    assert ticket["faculty"] == "Science"
    assert ticket_client.get(f"{HEAD}/all", headers=rbac.headers_for(staff)).json()[0]["id"] == ticket["id"]


def test_notice_is_private_and_can_be_acknowledged_while_whatsapp_is_retried(
    ticket_client: TestClient, ticket_db: Session,
) -> None:
    from datetime import datetime, timedelta, timezone

    from app.models.ticket import TicketNotification
    from app.services.ticket_notifications import dispatch_ticket_notification

    student = seed(ticket_db, "student", "Engineering")
    student.phone_number = "+51999900111"
    ticket_db.commit()
    other = seed(ticket_db, "student", "Engineering")
    staff = seed(ticket_db, "secretary", "Engineering")
    ticket = create(ticket_client, student)
    path = f"{HEAD}/{ticket['id']}"
    staff_headers = rbac.headers_for(staff)
    assert ticket_client.patch(path, headers=staff_headers, json={"status": "IN_REVIEW"}).status_code == 200
    assert ticket_client.patch(path, headers=staff_headers, json={
        "status": "RESOLVED", "resolution": "Private resolution details.",
    }).status_code == 200
    assert ticket_client.patch(path, headers=staff_headers, json={"status": "CLOSED"}).status_code == 200

    student_headers = rbac.headers_for(student)
    result = ticket_client.get(f"{HEAD}/notifications", headers=student_headers).json()
    assert len(result) == 1
    notice_path = f"{HEAD}/notifications/{result[0]['id']}/read"
    assert ticket_client.patch(notice_path, headers=rbac.headers_for(other)).status_code == 404
    assert ticket_client.patch(notice_path, headers=student_headers).status_code == 204
    assert ticket_client.patch(notice_path, headers=student_headers).status_code == 204
    assert ticket_client.get(f"{HEAD}/notifications", headers=student_headers).json() == []

    gateway = AsyncMock()
    gateway.send_text.side_effect = [False, True]
    assert dispatch_ticket_notification(ticket_db, gateway)
    notice = ticket_db.scalar(select(TicketNotification))
    assert notice is not None and notice.attempts == 1 and notice.whatsapp_sent_at is None
    assert not dispatch_ticket_notification(ticket_db, gateway)
    notice.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    ticket_db.commit()
    assert dispatch_ticket_notification(ticket_db, gateway)
    assert notice.whatsapp_sent_at is not None
    assert all("Private resolution" not in call.args[1] for call in gateway.send_text.call_args_list)


def test_tracking_code_collision_retries_without_reusing_another_ticket(
    ticket_client: TestClient, ticket_db: Session, monkeypatch: pytest.MonkeyPatch,
) -> None:
    draws = iter("AAAAAAAABBBB")
    monkeypatch.setattr("app.services.ticket_lifecycle.choice", lambda _alphabet: next(draws))
    student = seed(ticket_db, "student", "Science")
    other_student = seed(ticket_db, "student", "Science")
    first = create(ticket_client, student)
    second = create(ticket_client, other_student)
    assert first["tracking_code"].endswith("AAAA")
    assert second["tracking_code"].endswith("BBBB")
    assert second["id"] != first["id"]
    assert [event["to_status"] for event in second["audit"]] == ["OPEN"]
