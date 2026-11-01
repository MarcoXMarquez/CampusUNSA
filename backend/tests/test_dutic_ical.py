"""
US-25 Test Suite: UNSA Moodle iCal Calendar URL Subscription & Automated Task Ingestion.
Validates:
- iCalendar subscription and encrypted URL storage
- Domain validation restricting subscriptions to aulavirtual.unsa.edu.pe
- Parsing RFC 5545 iCalendar VEVENT entries into persistent tasks
- Handling revoked or expired calendar tokens (NEEDS_REAUTH)
- Deleting/clearing assignments for clean manual testing
"""

import uuid
from typing import Dict
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.classroom import ClassroomAssignment, ClassroomCourse
from app.models.user import User


SAMPLE_ICS_FEED = """BEGIN:VCALENDAR
METHOD:PUBLISH
PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024100713.01//EN
VERSION:2.0
BEGIN:VEVENT
UID:54022@aulavirtual.unsa.edu.pe/2026B
SUMMARY:Vencimiento de Laboratorio 5
DESCRIPTION:Subir informe final en formato PDF
CLASS:PUBLIC
LAST-MODIFIED:20261023T193749Z
DTSTAMP:20261101T231621Z
DTSTART:20261028T050000Z
DTEND:20261028T050000Z
CATEGORIES:26B_SISTEMAS_058
URL:https://aulavirtual.unsa.edu.pe/2026B/mod/assign/view.php?id=123
END:VEVENT
BEGIN:VEVENT
UID:56504@aulavirtual.unsa.edu.pe/2026B
SUMMARY:Vencimiento de ENTREGA LAB 08
DESCRIPTION:
CLASS:PUBLIC
LAST-MODIFIED:20261028T230639Z
DTSTAMP:20261101T231621Z
DTSTART:20261030T040000Z
DTEND:20261030T040000Z
CATEGORIES:26B_SISTEMAS_061
END:VEVENT
END:VCALENDAR
"""


@pytest.fixture
def test_db_session() -> Session:
    """Provides an isolated SQLite in-memory database session."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def auth_student(test_db_session: Session) -> User:
    """Creates a test student in the isolated session."""
    student = User(
        id=uuid.uuid4(),
        email="ical.student@unsa.edu.pe",
        cui="20220002",
        role="student",
        is_active=True,
    )
    test_db_session.add(student)
    test_db_session.commit()
    test_db_session.refresh(student)
    return student


@pytest.fixture
def auth_headers(auth_student: User) -> Dict[str, str]:
    """Provides Bearer auth headers for the test student."""
    token = create_access_token(data={"sub": str(auth_student.id), "role": auth_student.role})
    return {"Authorization": f"Bearer {token}"}


def test_dutic_ical_status_default(
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests default disconnected iCal status for a new user."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.get("/api/v1/dutic/ical/status", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["connected"] is False
        assert data["connected_at"] is None
        assert data["sync_status"] == "NOT_CONNECTED"

    app.dependency_overrides.clear()


def test_dutic_ical_subscribe_valid_url(
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """Tests subscribing a valid Moodle calendar URL and encrypting it at rest."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    valid_url = "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=18277&authtoken=abc123token&preset_what=all&preset_time=recentupcoming"

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/dutic/ical/subscribe",
            headers=auth_headers,
            json={"calendar_url": valid_url},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "CONNECTED"
        assert data["connected_at"] is not None

        # Verify database record is encrypted
        test_db_session.expire_all()
        refreshed = test_db_session.query(User).filter(User.id == auth_student.id).first()
        assert refreshed is not None
        assert refreshed.moodle_calendar_url is not None
        assert refreshed.moodle_calendar_url != valid_url
        assert refreshed.moodle_calendar_sync_status == "CONNECTED"

        # Verify status endpoint reflects connection
        status_res = client.get("/api/v1/dutic/ical/status", headers=auth_headers)
        assert status_res.status_code == 200
        assert status_res.json()["connected"] is True

    app.dependency_overrides.clear()


def test_dutic_ical_subscribe_untrusted_domain_rejected(
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests that subscribing a non-UNSA calendar URL is rejected with HTTP 400."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/dutic/ical/subscribe",
            headers=auth_headers,
            json={"calendar_url": "https://malicious-site.com/fake.ics"},
        )
        assert res.status_code == 400
        data = res.json()
        assert data["detail"]["code"] == "INVALID_CALENDAR_DOMAIN"

    app.dependency_overrides.clear()


@patch("httpx.Client.get")
def test_dutic_ical_sync_with_feed_data(
    mock_get: MagicMock,
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """Tests syncing iCal feed, parsing VEVENT items and upserting into PostgreSQL."""
    from app.services.token_encryption import encrypt_token

    valid_url = "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=18277&authtoken=validtoken"
    auth_student.moodle_calendar_url = encrypt_token(valid_url)
    auth_student.moodle_calendar_sync_status = "CONNECTED"
    test_db_session.commit()

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = SAMPLE_ICS_FEED
    mock_resp.headers = {"content-type": "text/calendar"}
    mock_get.return_value = mock_resp

    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/dutic/ical/sync",
            headers=auth_headers,
            json={},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "SYNCED"
        assert data["synced_assignments_count"] == 2
        assert data["synced_courses_count"] >= 1

        # Verify assignments in database
        assignments = (
            test_db_session.query(ClassroomAssignment)
            .filter(ClassroomAssignment.user_id == auth_student.id)
            .all()
        )
        assert len(assignments) == 2
        assert any("Laboratorio 5" in a.title for a in assignments)
        assert all(a.origin == "moodle" for a in assignments)

    app.dependency_overrides.clear()


@patch("httpx.Client.get")
def test_dutic_ical_sync_revoked_token_sets_needs_reauth(
    mock_get: MagicMock,
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """Tests handling of revoked or invalid Moodle token (Moodle redirects to login)."""
    from app.services.token_encryption import encrypt_token

    auth_student.moodle_calendar_url = encrypt_token(
        "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=18277&authtoken=revoked"
    )
    auth_student.moodle_calendar_sync_status = "CONNECTED"
    test_db_session.commit()

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "<html><body>Please log in at login/index.php</body></html>"
    mock_resp.headers = {"content-type": "text/html"}
    mock_get.return_value = mock_resp

    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/dutic/ical/sync",
            headers=auth_headers,
            json={},
        )
        assert res.status_code == 401
        data = res.json()
        assert data["detail"]["code"] == "NEEDS_REAUTH"

        test_db_session.expire_all()
        refreshed = test_db_session.query(User).filter(User.id == auth_student.id).first()
        assert refreshed is not None
        assert refreshed.moodle_calendar_sync_status == "NEEDS_REAUTH"

    app.dependency_overrides.clear()


def test_clear_assignments_endpoint(
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """Tests clearing/deleting assignments for clean manual testing and verification."""
    course = ClassroomCourse(
        id=uuid.uuid4(),
        user_id=auth_student.id,
        classroom_course_id="test-course-1",
        name="Test Course",
    )
    test_db_session.add(course)
    test_db_session.flush()

    a1 = ClassroomAssignment(
        id=uuid.uuid4(),
        user_id=auth_student.id,
        course_id=course.id,
        classroom_assignment_id="a1",
        title="Moodle Task",
        origin="moodle",
        state="PUBLISHED",
    )
    a2 = ClassroomAssignment(
        id=uuid.uuid4(),
        user_id=auth_student.id,
        course_id=course.id,
        classroom_assignment_id="a2",
        title="Classroom Task",
        origin="classroom",
        state="PUBLISHED",
    )
    test_db_session.add_all([a1, a2])
    test_db_session.commit()

    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        # Clear only moodle assignments
        res_m = client.delete("/api/v1/classroom/assignments?origin=moodle", headers=auth_headers)
        assert res_m.status_code == 200
        assert res_m.json()["deleted_count"] == 1

        remaining = test_db_session.query(ClassroomAssignment).filter(ClassroomAssignment.user_id == auth_student.id).all()
        assert len(remaining) == 1
        assert remaining[0].origin == "classroom"

        # Clear all assignments
        res_all = client.delete("/api/v1/classroom/assignments", headers=auth_headers)
        assert res_all.status_code == 200
        assert res_all.json()["deleted_count"] == 1

        remaining_all = test_db_session.query(ClassroomAssignment).filter(ClassroomAssignment.user_id == auth_student.id).all()
        assert len(remaining_all) == 0

    app.dependency_overrides.clear()


def test_clear_courses_endpoint(
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """Tests clearing/deleting courses and cascading to associated assignments."""
    c1 = ClassroomCourse(
        id=uuid.uuid4(),
        user_id=auth_student.id,
        classroom_course_id="moodle-cs101",
        name="Moodle CS101",
    )
    c2 = ClassroomCourse(
        id=uuid.uuid4(),
        user_id=auth_student.id,
        classroom_course_id="classroom-g202",
        name="Classroom G202",
    )
    test_db_session.add_all([c1, c2])
    test_db_session.flush()

    a1 = ClassroomAssignment(
        id=uuid.uuid4(),
        user_id=auth_student.id,
        course_id=c1.id,
        classroom_assignment_id="task-c1",
        title="Moodle Task",
        origin="moodle",
        state="PUBLISHED",
    )
    test_db_session.add(a1)
    test_db_session.commit()

    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        # Clear only moodle courses
        res_m = client.delete("/api/v1/classroom/courses?origin=moodle", headers=auth_headers)
        assert res_m.status_code == 200
        assert res_m.json()["deleted_count"] == 1

        # Check moodle course and cascaded assignment are gone
        remaining_courses = test_db_session.query(ClassroomCourse).filter(ClassroomCourse.user_id == auth_student.id).all()
        assert len(remaining_courses) == 1
        assert remaining_courses[0].classroom_course_id == "classroom-g202"

        remaining_assigns = test_db_session.query(ClassroomAssignment).filter(ClassroomAssignment.user_id == auth_student.id).all()
        assert len(remaining_assigns) == 0

        # Clear remaining courses
        res_all = client.delete("/api/v1/classroom/courses", headers=auth_headers)
        assert res_all.status_code == 200
        assert res_all.json()["deleted_count"] == 1

        remaining_all = test_db_session.query(ClassroomCourse).filter(ClassroomCourse.user_id == auth_student.id).all()
        assert len(remaining_all) == 0

    app.dependency_overrides.clear()
