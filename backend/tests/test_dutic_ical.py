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


def test_dutic_ical_rejects_insecure_http_scheme(
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests that subscribing with insecure http:// scheme is rejected."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/dutic/ical/subscribe",
            headers=auth_headers,
            json={"calendar_url": "http://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?authtoken=abc"},
        )
        assert res.status_code == 400
        data = res.json()
        assert data["detail"]["code"] == "INVALID_CALENDAR_SCHEME"

    app.dependency_overrides.clear()


def test_dutic_ical_rejects_loopback_and_internal_hosts(
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests that loopback, private IP, and unauthorized host targets are rejected."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    malicious_urls = [
        "https://localhost/calendar/export_execute.php?authtoken=abc",
        "https://127.0.0.1/calendar/export_execute.php?authtoken=abc",
        "https://169.254.169.254/latest/meta-data/",
        "https://10.0.0.1/calendar/export_execute.php?authtoken=abc",
        "https://attacker-aulavirtual.unsa.edu.pe/calendar/export_execute.php?authtoken=abc",
        "https://aulavirtual.unsa.edu.pe.attacker.com/calendar/export_execute.php?authtoken=abc",
    ]

    with TestClient(app) as client:
        for bad_url in malicious_urls:
            res = client.post(
                "/api/v1/dutic/ical/subscribe",
                headers=auth_headers,
                json={"calendar_url": bad_url},
            )
            assert res.status_code == 400
            assert res.json()["detail"]["code"] in ("INVALID_CALENDAR_DOMAIN", "INVALID_CALENDAR_SCHEME")

    app.dependency_overrides.clear()


def test_dutic_ical_rejects_custom_ports(
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests that non-standard ports are rejected to prevent port-scanning SSRF."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/dutic/ical/subscribe",
            headers=auth_headers,
            json={"calendar_url": "https://aulavirtual.unsa.edu.pe:8443/2026B/calendar/export_execute.php?authtoken=abc"},
        )
        assert res.status_code == 400
        assert res.json()["detail"]["code"] == "INVALID_CALENDAR_PORT"

    app.dependency_overrides.clear()


def test_dutic_ical_rejects_userinfo_credentials(
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests that embedded credentials in the URL are rejected."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/dutic/ical/subscribe",
            headers=auth_headers,
            json={"calendar_url": "https://attacker:pass@aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?authtoken=abc"},
        )
        assert res.status_code == 400
        assert res.json()["detail"]["code"] == "INVALID_CALENDAR_CREDENTIALS"

    app.dependency_overrides.clear()


def test_dutic_ical_rejects_path_traversal_and_non_calendar_endpoints(
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests that path traversal and non-export Moodle endpoints are rejected."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    bad_endpoints = [
        "https://aulavirtual.unsa.edu.pe/2026B/calendar/../../admin/settings.php?authtoken=abc",
        "https://aulavirtual.unsa.edu.pe/2026B/course/view.php?id=1&authtoken=abc",
        "https://aulavirtual.unsa.edu.pe/login/index.php?authtoken=abc",
    ]

    with TestClient(app) as client:
        for bad_url in bad_endpoints:
            res = client.post(
                "/api/v1/dutic/ical/subscribe",
                headers=auth_headers,
                json={"calendar_url": bad_url},
            )
            assert res.status_code == 400
            assert res.json()["detail"]["code"] == "INVALID_CALENDAR_PATH"

    app.dependency_overrides.clear()


def test_dutic_ical_rejects_missing_authtoken(
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests that calendar URLs lacking a token parameter are rejected."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/dutic/ical/subscribe",
            headers=auth_headers,
            json={"calendar_url": "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=123"},
        )
        assert res.status_code == 400
        assert res.json()["detail"]["code"] == "MISSING_CALENDAR_TOKEN"

    app.dependency_overrides.clear()


def test_dutic_ical_sync_enforces_canonical_url_and_no_redirects(
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """Tests that sync reconstructs canonical https://aulavirtual.unsa.edu.pe base URL and sets follow_redirects=False."""
    from app.services.token_encryption import encrypt_token

    valid_url = "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=18277&authtoken=validtoken"
    auth_student.moodle_calendar_url = encrypt_token(valid_url)
    auth_student.moodle_calendar_sync_status = "CONNECTED"
    test_db_session.commit()

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = SAMPLE_ICS_FEED
    mock_resp.headers = {"content-type": "text/calendar"}

    app.dependency_overrides[get_db] = lambda: test_db_session

    with patch("httpx.Client") as mock_client_cls:
        mock_client_instance = MagicMock()
        mock_client_instance.__enter__.return_value = mock_client_instance
        mock_client_instance.get.return_value = mock_resp
        mock_client_cls.return_value = mock_client_instance

        with TestClient(app) as client:
            res = client.post(
                "/api/v1/dutic/ical/sync",
                headers=auth_headers,
                json={},
            )
            assert res.status_code == 200

            # Verify httpx.Client was initialized with follow_redirects=False
            mock_client_cls.assert_called_once()
            call_kwargs = mock_client_cls.call_args[1]
            assert call_kwargs.get("follow_redirects") is False

            # Verify client.get was called with canonical https://aulavirtual.unsa.edu.pe URL
            mock_client_instance.get.assert_called_once()
            called_url = mock_client_instance.get.call_args[0][0]
            assert called_url.startswith("https://aulavirtual.unsa.edu.pe/")

    app.dependency_overrides.clear()


@patch("socket.getaddrinfo")
def test_dutic_ical_rejects_ssrf_when_dns_resolves_to_private_ip(
    mock_getaddrinfo: MagicMock,
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests that if DNS resolution returns a private/loopback/cloud metadata IP, SSRF is rejected."""
    mock_getaddrinfo.return_value = [
        (2, 1, 6, "", ("169.254.169.254", 443)),
    ]

    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/dutic/ical/subscribe",
            headers=auth_headers,
            json={"calendar_url": "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?authtoken=abc123token"},
        )
        assert res.status_code == 400
        assert res.json()["detail"]["code"] == "SSRF_DETECTED"

    app.dependency_overrides.clear()


def test_course_origin_column_filters_moodle_without_id_prefix_hack(
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """Courses must filter by explicit origin column instead of fragile 'moodle-' ID prefixes."""
    moodle_course = ClassroomCourse(
        id=uuid.uuid4(),
        user_id=auth_student.id,
        classroom_course_id="unsa-2026-sis",
        name="Arquitectura de Software",
        origin="moodle",
    )
    classroom_course = ClassroomCourse(
        id=uuid.uuid4(),
        user_id=auth_student.id,
        classroom_course_id="gclass-99",
        name="Base de Datos",
        origin="classroom",
    )
    test_db_session.add_all([moodle_course, classroom_course])
    test_db_session.commit()

    app.dependency_overrides[get_db] = lambda: test_db_session
    try:
        with TestClient(app) as client:
            res = client.get("/api/v1/dutic/courses", headers=auth_headers)
            assert res.status_code == 200
            courses = res.json()
            assert len(courses) == 1
            assert courses[0]["classroom_course_id"] == "unsa-2026-sis"
            assert courses[0]["origin"] == "moodle"

            del_res = client.delete("/api/v1/classroom/courses?origin=moodle", headers=auth_headers)
            assert del_res.status_code == 200
            assert del_res.json()["deleted_count"] == 1
    finally:
        app.dependency_overrides.clear()

    remaining = (
        test_db_session.query(ClassroomCourse)
        .filter(ClassroomCourse.user_id == auth_student.id)
        .all()
    )
    assert len(remaining) == 1
    assert remaining[0].classroom_course_id == "gclass-99"


def test_moodle_sync_does_not_overwrite_google_classroom_sync_state(
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """DUTIC sync errors must update Moodle state without clobbering Google Classroom fields."""
    from app.core.exceptions import DuticSessionExpiredError

    auth_student.classroom_sync_status = "SYNCED"
    auth_student.google_classroom_sync_status = "CONNECTED"
    test_db_session.commit()

    app.dependency_overrides[get_db] = lambda: test_db_session
    try:
        with patch(
            "app.services.dutic_sync.DuticApiClient.fetch_enrolled_courses",
            side_effect=DuticSessionExpiredError("Moodle session expired"),
        ):
            with TestClient(app) as client:
                res = client.post(
                    "/api/v1/dutic/sync",
                    headers=auth_headers,
                    json={"moodle_session": "expired", "sesskey": "bad"},
                )
                assert res.status_code == 401
    finally:
        app.dependency_overrides.clear()

    test_db_session.expire_all()
    refreshed = test_db_session.query(User).filter(User.id == auth_student.id).first()
    assert refreshed is not None
    assert refreshed.classroom_sync_status == "SYNCED"
    assert refreshed.google_classroom_sync_status == "CONNECTED"
    assert refreshed.moodle_calendar_sync_status == "NEEDS_REAUTH"


def test_parse_ical_content_generates_deterministic_uid_when_uid_missing() -> None:
    """Missing iCal UIDs must hash event content rather than array index position."""
    from app.services.dutic_ical import DuticIcalService

    event_alpha = (
        "BEGIN:VEVENT\n"
        "SUMMARY:Practica Calificada 1\n"
        "DTEND:20261120T235900Z\n"
        "CATEGORIES:26B_IS_101\n"
        "END:VEVENT\n"
    )
    event_beta = (
        "BEGIN:VEVENT\n"
        "SUMMARY:Examen Parcial\n"
        "DTEND:20261125T180000Z\n"
        "CATEGORIES:26B_IS_102\n"
        "END:VEVENT\n"
    )
    feed_ab = f"BEGIN:VCALENDAR\nVERSION:2.0\n{event_alpha}{event_beta}END:VCALENDAR\n"
    feed_ba = f"BEGIN:VCALENDAR\nVERSION:2.0\n{event_beta}{event_alpha}END:VCALENDAR\n"

    parsed_ab = {item["title"]: item["uid"] for item in DuticIcalService.parse_ical_content(feed_ab)}
    parsed_ba = {item["title"]: item["uid"] for item in DuticIcalService.parse_ical_content(feed_ba)}

    assert parsed_ab["Practica Calificada 1"] == parsed_ba["Practica Calificada 1"]
    assert parsed_ab["Examen Parcial"] == parsed_ba["Examen Parcial"]
    assert parsed_ab["Practica Calificada 1"] != parsed_ab["Examen Parcial"]


