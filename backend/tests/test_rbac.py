"""US-03 acceptance and adversarial authorization tests."""

import os
import uuid
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.config import settings
from app.core.security import create_access_token
from app.main import app
from app.models.user import User


def test_staff_queue_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/v1/tickets/all")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_staff_queue_rejects_invalid_token(client: TestClient) -> None:
    response = client.get(
        "/api/v1/tickets/all", headers={"Authorization": "Bearer invalid.token"}
    )
    assert response.status_code == 401


@pytest.fixture
def ticket_db() -> Iterator[Session]:
    # PostgreSQL tests use a transaction-scoped schema, never production tables.
    database_url = os.environ.get("RBAC_TEST_DATABASE_URL")
    if database_url:
        engine = create_engine(database_url)
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                schema = f"rbac_test_{uuid.uuid4().hex}"
                connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
                connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
                Base.metadata.create_all(connection)
                with Session(
                    bind=connection, join_transaction_mode="create_savepoint"
                ) as session:
                    yield session
            finally:
                transaction.rollback()
        engine.dispose()
        return

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def ticket_client(ticket_db: Session) -> Iterator[TestClient]:
    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: ticket_db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def add_user(db: Session, role: str, *, active: bool = True) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4().hex}@unsa.edu.pe",
        role=role,
        is_active=active,
    )
    db.add(user)
    db.commit()
    return user


def headers_for(user: User, *, claimed_role: str | None = None) -> dict[str, str]:
    token = create_access_token(
        {"sub": str(user.id), "role": claimed_role or user.role}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        ("student", 403),
        ("secretary", 200),
        ("admin", 200),
        ("superadmin", 403),
        ("Secretary", 403),
        ("", 403),
    ],
)
def test_staff_queue_role_matrix(
    ticket_client: TestClient, ticket_db: Session, role: str, expected: int
) -> None:
    user = add_user(ticket_db, role)
    response = ticket_client.get("/api/v1/tickets/all", headers=headers_for(user))
    assert response.status_code == expected
    if expected == 200:
        assert response.json() == []
    else:
        assert response.json()["detail"]["code"] == "INSUFFICIENT_PERMISSIONS"


@pytest.mark.parametrize("role", ["student", "secretary", "admin"])
def test_inactive_users_cannot_access_queue(
    ticket_client: TestClient, ticket_db: Session, role: str
) -> None:
    user = add_user(ticket_db, role, active=False)
    response = ticket_client.get("/api/v1/tickets/all", headers=headers_for(user))
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "USER_INACTIVE"


@pytest.mark.parametrize("claimed_role", ["secretary", "admin"])
def test_student_cannot_elevate_role_through_claim_or_query(
    ticket_client: TestClient, ticket_db: Session, claimed_role: str
) -> None:
    user = add_user(ticket_db, "student")
    response = ticket_client.get(
        "/api/v1/tickets/all?role=admin",
        headers=headers_for(user, claimed_role=claimed_role),
    )
    assert response.status_code == 403


def test_role_revocation_takes_effect_before_token_expiry(
    ticket_client: TestClient, ticket_db: Session
) -> None:
    user = add_user(ticket_db, "secretary")
    headers = headers_for(user)
    assert ticket_client.get("/api/v1/tickets/all", headers=headers).status_code == 200
    user.role = "student"
    ticket_db.commit()
    assert ticket_client.get("/api/v1/tickets/all", headers=headers).status_code == 403


@pytest.mark.parametrize(
    "claims", [{"sub": str(uuid.uuid4())}, {"sub": "invalid"}, {"role": "admin"}]
)
def test_unresolvable_identity_is_rejected(
    ticket_client: TestClient, claims: dict[str, str]
) -> None:
    token = create_access_token(claims)
    response = ticket_client.get(
        "/api/v1/tickets/all", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


def test_expired_token_is_rejected(
    ticket_client: TestClient, ticket_db: Session
) -> None:
    user = add_user(ticket_db, "admin")
    token = create_access_token(
        {"sub": str(user.id), "role": "admin"}, expires_delta=timedelta(seconds=-5)
    )
    response = ticket_client.get(
        "/api/v1/tickets/all", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


@pytest.mark.parametrize("role", ["student", "secretary", "admin", "unknown"])
@pytest.mark.parametrize("allowed_role", ["student", "secretary", "admin"])
def test_dependency_checks_explicit_roles(role: str, allowed_role: str) -> None:
    from app.api.dependencies import has_role

    guard = has_role([allowed_role])
    user = User(role=role, is_active=True)
    if role == allowed_role:
        assert guard(user) is user
    else:
        with pytest.raises(HTTPException) as error:
            guard(user)
        assert error.value.status_code == 403


@pytest.mark.parametrize("allowed", [[], ["unknown"], ["admin", "unknown"], "admin"])
def test_invalid_role_policy_is_rejected_at_startup(allowed: list[str] | str) -> None:
    from app.api.dependencies import has_role

    with pytest.raises(ValueError):
        has_role(allowed)


def test_permission_mask_is_enforced_without_widening_allowed_roles() -> None:
    from app.api.dependencies import has_role
    from app.core.permissions import Permission

    guard = has_role(["student", "secretary"], permissions=Permission.READ_ALL_TICKETS)
    secretary = User(role="secretary", is_active=True)
    assert guard(secretary) is secretary
    for role in ("student", "admin"):
        with pytest.raises(HTTPException) as error:
            guard(User(role=role, is_active=True))
        assert error.value.status_code == 403


def test_invalid_permission_mask_is_rejected_at_startup() -> None:
    from app.api.dependencies import has_role
    from app.core.permissions import Permission

    with pytest.raises(ValueError):
        has_role(["admin"], permissions=Permission(128))


def test_inactive_identity_cannot_bypass_guard() -> None:
    from app.api.dependencies import has_role

    with pytest.raises(HTTPException) as error:
        has_role(["admin"])(User(role="admin", is_active=False))
    assert error.value.status_code == 403


def test_token_signed_by_another_key_is_rejected(
    ticket_client: TestClient, ticket_db: Session
) -> None:
    user = add_user(ticket_db, "admin")
    token = jwt.encode(
        {"sub": str(user.id), "role": "admin"},
        "untrusted-test-signing-key",
        algorithm=settings.ALGORITHM,
    )
    response = ticket_client.get(
        "/api/v1/tickets/all", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


@pytest.mark.parametrize("role", ["secretary", "admin"])
def test_queue_returns_only_active_tickets(
    ticket_client: TestClient, ticket_db: Session, role: str
) -> None:
    from app.models.ticket import Ticket

    staff = add_user(ticket_db, role)
    student = add_user(ticket_db, "student")
    for status in ("OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"):
        ticket_db.add(
            Ticket(
                id=uuid.uuid4(),
                tracking_code=f"TICK-2026-{status}",
                student_id=student.id,
                category="Enrollment",
                subject=f"Ticket {status}",
                status=status,
                created_at=datetime(2026, 10, 16, tzinfo=timezone.utc),
            )
        )
    ticket_db.commit()

    response = ticket_client.get("/api/v1/tickets/all", headers=headers_for(staff))
    assert response.status_code == 200
    data = response.json()
    assert {ticket["status"] for ticket in data} == {"OPEN", "IN_REVIEW"}
    assert {ticket["student_id"] for ticket in data} == {str(student.id)}
    assert all(
        set(ticket)
        == {
            "id",
            "tracking_code",
            "student_id",
            "assigned_secretary_id",
            "category",
            "subject",
            "status",
            "created_at",
            "resolved_at",
        }
        for ticket in data
    )


def test_student_receives_no_other_student_ticket_data(
    ticket_client: TestClient, ticket_db: Session
) -> None:
    from app.models.ticket import Ticket

    requester = add_user(ticket_db, "student")
    owner = add_user(ticket_db, "student")
    ticket_db.add(
        Ticket(
            student_id=owner.id,
            tracking_code="TICK-2026-PRIVATE",
            category="Enrollment",
            subject="Private student request",
            status="OPEN",
        )
    )
    ticket_db.commit()
    response = ticket_client.get("/api/v1/tickets/all", headers=headers_for(requester))
    assert response.status_code == 403
    assert "Private student request" not in response.text


def test_queue_pagination_is_stable(
    ticket_client: TestClient, ticket_db: Session
) -> None:
    from app.models.ticket import Ticket

    staff = add_user(ticket_db, "admin")
    for number in range(3):
        ticket_db.add(
            Ticket(
                id=uuid.UUID(int=number + 1),
                student_id=staff.id,
                tracking_code=f"TICK-2026-{number}",
                category="Enrollment",
                subject=f"Ticket {number}",
                status="OPEN",
                created_at=datetime(2026, 10, 16, tzinfo=timezone.utc),
            )
        )
    ticket_db.commit()
    headers = headers_for(staff)
    first = ticket_client.get("/api/v1/tickets/all?limit=1&offset=0", headers=headers)
    second = ticket_client.get("/api/v1/tickets/all?limit=1&offset=1", headers=headers)
    assert first.status_code == second.status_code == 200
    assert first.json()[0]["id"] == str(uuid.UUID(int=1))
    assert second.json()[0]["id"] == str(uuid.UUID(int=2))


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1"])
def test_queue_rejects_invalid_pagination(
    ticket_client: TestClient, ticket_db: Session, query: str
) -> None:
    staff = add_user(ticket_db, "admin")
    response = ticket_client.get(
        f"/api/v1/tickets/all?{query}", headers=headers_for(staff)
    )
    assert response.status_code == 422
