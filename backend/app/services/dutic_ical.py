"""
UNSA Moodle iCalendar (RFC 5545) Ingestion Service.
Handles:
- URL domain security validation (restricting subscriptions to aulavirtual.unsa.edu.pe)
- Fetching raw .ics feeds using persistent authtoken (no cookies or sesskey required)
- Line-unfolding and parsing VCALENDAR / VEVENT data into structured academic tasks
- Idempotent upserting into PostgreSQL with origin='moodle'
- Error handling for revoked tokens (HTTP 401 / NEEDS_REAUTH)
"""

from datetime import datetime, timezone
import ipaddress
import posixpath
import socket
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse
import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.classroom import ClassroomAssignment, ClassroomCourse
from app.models.user import User
from app.schemas.dutic import SyncDuticResponse
from app.services.token_encryption import decrypt_token


class DuticIcalService:
    """Service client for fetching, parsing, and ingesting Moodle iCal feeds."""

    ALLOWED_SCHEME = "https"
    ALLOWED_HOST = "aulavirtual.unsa.edu.pe"

    @staticmethod
    def _verify_host_ip_safety(hostname: str) -> None:
        """
        Resolves hostname and verifies that target IPs do not point to loopback,
        private (RFC 1918), link-local, or cloud metadata addresses.
        """
        try:
            addr_info = socket.getaddrinfo(hostname, 443, proto=socket.IPPROTO_TCP)
            for item in addr_info:
                ip_str = item[4][0]
                ip = ipaddress.ip_address(ip_str)
                if (
                    ip.is_private
                    or ip.is_loopback
                    or ip.is_reserved
                    or ip.is_link_local
                    or ip.is_multicast
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "SSRF_DETECTED",
                            "message": "Resolved host IP address is non-public or prohibited",
                        },
                    )
        except socket.gaierror:
            # Tolerates environments where external DNS lookup is unavailable (e.g., isolated testing)
            pass

    @classmethod
    def validate_calendar_url(cls, url: str) -> str:
        """
        Validates that the provided URL belongs strictly to the official UNSA Moodle domain,
        uses HTTPS, contains legitimate calendar export endpoints, and prevents SSRF attacks.
        Returns the sanitized canonical URL.
        """
        if not url or not url.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "EMPTY_CALENDAR_URL",
                    "message": "Calendar URL cannot be empty",
                },
            )

        try:
            parsed = urlparse(url.strip())
            if not parsed.scheme or not parsed.netloc:
                raise ValueError("Malformed URL")

            # 1. Strict scheme enforcement (HTTPS only)
            if parsed.scheme.lower() != cls.ALLOWED_SCHEME:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "INVALID_CALENDAR_SCHEME",
                        "message": "Calendar URL must use secure HTTPS protocol",
                    },
                )

            # 2. Reject embedded userinfo/credentials
            if parsed.username or parsed.password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "INVALID_CALENDAR_CREDENTIALS",
                        "message": "User credentials in URL are strictly prohibited",
                    },
                )

            # 3. Reject non-standard ports to prevent internal port scanning
            if parsed.port is not None and parsed.port != 443:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "INVALID_CALENDAR_PORT",
                        "message": "Custom network ports are strictly prohibited",
                    },
                )

            # 4. Strict hostname whitelist
            hostname = (parsed.hostname or "").lower().strip()
            if hostname != cls.ALLOWED_HOST:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "INVALID_CALENDAR_DOMAIN",
                        "message": f"Calendar URL must belong strictly to {cls.ALLOWED_HOST}",
                    },
                )

            # 5. Path traversal prevention and endpoint verification
            raw_path = parsed.path or ""
            if ".." in raw_path or "\\" in raw_path:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "INVALID_CALENDAR_PATH",
                        "message": "Path traversal sequences are strictly prohibited",
                    },
                )

            norm_path = posixpath.normpath(raw_path)
            if not (norm_path.endswith("/calendar/export_execute.php") or norm_path.endswith("/calendar/export.php")):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "INVALID_CALENDAR_PATH",
                        "message": "URL must point to a legitimate Moodle calendar export endpoint",
                    },
                )

            # 6. Moodle calendar token presence validation
            query_params = parse_qs(parsed.query, keep_blank_values=False)
            token_keys = {"authtoken", "token"}
            if not any(k.lower() in token_keys for k in query_params):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "MISSING_CALENDAR_TOKEN",
                        "message": "Calendar URL must contain a valid authtoken or token parameter",
                    },
                )

            # 7. Private IP / SSRF resolution check
            cls._verify_host_ip_safety(hostname)

            # 8. Construct canonical URL (scheme and host are fixed constants)
            canonical_url = f"https://{cls.ALLOWED_HOST}{norm_path}"
            if parsed.query:
                canonical_url = f"{canonical_url}?{parsed.query}"
            return canonical_url

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_CALENDAR_URL",
                    "message": f"Invalid URL format: {exc}",
                },
            ) from exc

    @staticmethod
    def _parse_ics_datetime(raw_val: str) -> Optional[datetime]:
        """
        Parses RFC 5545 date-time format (e.g., '20261028T050000Z' or '20261028') to UTC datetime.
        """
        if not raw_val:
            return None
        val = raw_val.strip()
        try:
            if val.endswith("Z"):
                return datetime.strptime(val, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            if "T" in val:
                return datetime.strptime(val, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
            return datetime.strptime(val, "%Y%m%d").replace(hour=23, minute=59, tzinfo=timezone.utc)
        except (ValueError, TypeError):
            return None

    @classmethod
    def parse_ical_content(cls, ics_text: str) -> List[Dict[str, Any]]:
        """
        Parses raw iCalendar text into a structured list of task dictionaries.
        Handles RFC 5545 line unfolding (lines starting with space or tab).
        """
        if not ics_text:
            return []

        # RFC 5545 line unfolding
        unfolded_lines: List[str] = []
        for line in ics_text.splitlines():
            if line.startswith((" ", "\t")) and unfolded_lines:
                unfolded_lines[-1] += line[1:]
            else:
                unfolded_lines.append(line)

        events: List[Dict[str, Any]] = []
        current_event: Optional[Dict[str, str]] = None

        for line in unfolded_lines:
            line_str = line.strip()
            if line_str == "BEGIN:VEVENT":
                current_event = {}
            elif line_str == "END:VEVENT" and current_event is not None:
                # Process completed event
                uid = current_event.get("UID", "").strip()
                summary = current_event.get("SUMMARY", "Actividad Moodle").strip()
                description = current_event.get("DESCRIPTION", "").replace("\\n", "\n").replace("\\,", ",").strip()
                category = current_event.get("CATEGORIES", "").strip()
                raw_due = current_event.get("DTEND") or current_event.get("DTSTART") or ""
                url = current_event.get("URL", "").strip()

                due_dt = cls._parse_ics_datetime(raw_due)

                events.append({
                    "uid": uid or f"moodle-ical-{len(events)}",
                    "title": summary,
                    "description": description or None,
                    "category": category or "UNSA Moodle",
                    "due_date": due_dt,
                    "url": url or None,
                })
                current_event = None
            elif current_event is not None and ":" in line_str:
                parts = line_str.split(":", 1)
                prop_key = parts[0].split(";")[0].upper()
                prop_val = parts[1]
                current_event[prop_key] = prop_val

        return events

    @classmethod
    def sync_student_moodle_ical(
        cls,
        db: Session,
        user: User,
        calendar_url: Optional[str] = None,
    ) -> SyncDuticResponse:
        """
        Fetches the student's Moodle iCalendar feed and idempotently upserts events into PostgreSQL.
        """
        effective_url: str = ""
        if calendar_url and calendar_url.strip():
            effective_url = calendar_url.strip()
        else:
            if not user.moodle_calendar_url:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "CALENDAR_NOT_CONNECTED",
                        "message": "Moodle iCal calendar URL is not configured. Please subscribe your URL first.",
                    },
                )
            effective_url = decrypt_token(user.moodle_calendar_url)

        canonical_url = cls.validate_calendar_url(effective_url)

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/128.0.0.0 Safari/537.36"
            ),
            "Accept": "text/calendar, text/plain, */*",
        }

        try:
            with httpx.Client(timeout=15.0, follow_redirects=False) as client:
                response = client.get(canonical_url, headers=headers)

                # Check for session/token rejection or login redirects
                content_type = response.headers.get("content-type", "").lower()
                text_preview = response.text[:500].lower() if response.text else ""

                if (
                    response.status_code in (302, 303, 401)
                    or "login/index.php" in text_preview
                    or "please log in" in text_preview
                    or ("text/html" in content_type and "begin:vcalendar" not in text_preview)
                ):
                    user.moodle_calendar_sync_status = "NEEDS_REAUTH"
                    db.commit()
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail={
                            "code": "NEEDS_REAUTH",
                            "message": "Moodle calendar token has expired or is invalid. Please regenerate your export URL.",
                        },
                    )

                if response.status_code == 429:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail={
                            "code": "RATE_LIMIT_EXCEEDED",
                            "message": "Moodle rate limit exceeded. Please retry in a few minutes.",
                        },
                    )

                response.raise_for_status()
                ics_content = response.text

        except HTTPException:
            raise
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=exc.response.status_code,
                detail={
                    "code": "DUTIC_HTTP_ERROR",
                    "message": f"Moodle returned HTTP status {exc.response.status_code}",
                },
            ) from exc
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "NETWORK_ERROR",
                    "message": f"Network error connecting to Moodle calendar: {exc}",
                },
            ) from exc

        events = cls.parse_ical_content(ics_content)
        courses_by_category: Dict[str, ClassroomCourse] = {}
        synced_assignments_count = 0

        for item in events:
            category = item["category"]
            course_code = f"moodle-{category}"

            # Idempotently upsert course
            if category not in courses_by_category:
                course = (
                    db.query(ClassroomCourse)
                    .filter(
                        ClassroomCourse.user_id == user.id,
                        ClassroomCourse.classroom_course_id == course_code,
                    )
                    .first()
                )
                if not course:
                    course = ClassroomCourse(
                        user_id=user.id,
                        classroom_course_id=course_code,
                        name=f"Curso {category}",
                        section=category,
                    )
                    db.add(course)
                    db.flush()
                courses_by_category[category] = course
            else:
                course = courses_by_category[category]

            # Idempotently upsert assignment
            uid = item["uid"]
            assignment = (
                db.query(ClassroomAssignment)
                .filter(
                    ClassroomAssignment.user_id == user.id,
                    ClassroomAssignment.classroom_assignment_id == uid,
                )
                .first()
            )
            if not assignment:
                assignment = ClassroomAssignment(
                    user_id=user.id,
                    course_id=course.id,
                    classroom_assignment_id=uid,
                    title=item["title"],
                    description=item["description"],
                    due_date=item["due_date"],
                    origin="moodle",
                    state="PUBLISHED",
                    alternate_link=item["url"],
                )
                db.add(assignment)
            else:
                assignment.course_id = course.id
                assignment.title = item["title"]
                assignment.description = item["description"]
                assignment.due_date = item["due_date"]
                assignment.alternate_link = item["url"]
                assignment.updated_at = datetime.now(timezone.utc)

            synced_assignments_count += 1

        sync_timestamp = datetime.now(timezone.utc)
        user.moodle_calendar_sync_status = "SYNCED"
        user.last_classroom_sync_at = sync_timestamp
        db.commit()

        return SyncDuticResponse(
            status="SYNCED",
            synced_courses_count=len(courses_by_category),
            synced_assignments_count=synced_assignments_count,
            synced_at=sync_timestamp,
        )
