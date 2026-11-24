"""Turn one authenticated WhatsApp delivery into a student-owned assignment."""

import asyncio
import re
from datetime import datetime
from hashlib import sha256
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.classroom import ClassroomAssignment, CourseCatalog, UserCourseEnrollment
from app.models.user import User
from app.schemas.task_parser import ParseTaskRequest
from app.schemas.webhook import QueuedWhatsAppEvent
from app.services.academic.curriculum_resolver import DEFAULT_TERM, normalize_course_text
from app.services.messaging.gateway import MessagingGatewayProtocol
from app.services.tasks.task_parser import NLPTaskParserService

LIMA = ZoneInfo("America/Lima")
MONTH_ABBREVIATIONS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
PHONE_JID = re.compile(r"([1-9][0-9]{7,14})(?::[0-9]+)?@s\.whatsapp\.net")
LID_JID = re.compile(r"[0-9]+(?::[0-9]+)?@lid")
TaskOutcome = Literal["created", "duplicate", "clarification", "ignored"]


class WhatsAppConfirmationError(RuntimeError):
    """The outbound gateway did not confirm dispatch."""


def confirmation_message(title: str, due_date: datetime) -> str:
    local = due_date.astimezone(LIMA)
    month = MONTH_ABBREVIATIONS[local.month - 1]
    return f"Task scheduled: {title} due {month} {local.day}, {local:%H:%M}"


def direct_sender_and_text(event: QueuedWhatsAppEvent) -> tuple[str, str] | None:
    data = event.payload.data
    key = data.key
    if key.fromMe:
        return None
    jid = key.remoteJid
    if LID_JID.fullmatch(jid):
        alternate = (key.model_extra or {}).get("remoteJidAlt")
        if not isinstance(alternate, str):
            return None
        jid = alternate
    phone = PHONE_JID.fullmatch(jid)
    if phone is None:
        return None

    text = data.message.get("conversation")
    if not isinstance(text, str):
        extended = data.message.get("extendedTextMessage")
        text = extended.get("text") if isinstance(extended, dict) else None
    if not isinstance(text, str):
        return None
    text = text.strip()
    # Pairing codes belong to the OTP flow and must never reach the language model.
    if not text or len(text) > 2000 or re.fullmatch(r"[0-9]{6}", text):
        return None
    return f"+{phone[1]}", text


class TaskService:
    """Persist a task only when Evolution accepts its confirmation."""

    def __init__(
        self, db: Session, parser: NLPTaskParserService, gateway: MessagingGatewayProtocol
    ) -> None:
        self.db = db
        self.parser = parser
        self.gateway = gateway

    def _find_student(self, phone: str, *, lock: bool = False) -> User | None:
        query = select(User).where(
            User.phone_number == phone,
            User.role == "student",
            User.is_active.is_(True),
        )
        if lock:
            query = query.with_for_update()
        return self.db.scalar(query)

    def _enrollments(self, student_id: UUID) -> list[tuple[UserCourseEnrollment, str]]:
        rows = self.db.execute(
            select(UserCourseEnrollment, CourseCatalog.official_name)
            .join(CourseCatalog, CourseCatalog.code == UserCourseEnrollment.course_code)
            .where(
                UserCourseEnrollment.user_id == student_id,
                UserCourseEnrollment.term == DEFAULT_TERM,
            )
            .order_by(CourseCatalog.official_name, UserCourseEnrollment.course_code)
        )
        return [(enrollment, name) for enrollment, name in rows.tuples()]

    def _exists(self, student_id: UUID, external_id: str) -> bool:
        return self.db.scalar(
            select(ClassroomAssignment.id).where(
                ClassroomAssignment.user_id == student_id,
                ClassroomAssignment.classroom_assignment_id == external_id,
            )
        ) is not None

    async def _confirm(self, phone: str, message: str) -> None:
        try:
            async with asyncio.timeout(12):
                sent = await self.gateway.send_text(phone, message)
        except Exception as error:
            raise WhatsAppConfirmationError("Outbound dispatch failed") from error
        if not sent:
            raise WhatsAppConfirmationError("Outbound dispatch was rejected")

    async def create_from_whatsapp(self, event: QueuedWhatsAppEvent) -> TaskOutcome:
        """Validate ownership, parse text, and commit only after successful dispatch."""
        sender = direct_sender_and_text(event)
        if sender is None:
            return "ignored"
        phone, text = sender
        identity = "\0".join((event.payload.instance, phone, event.payload.data.key.id))
        external_id = "whatsapp-" + sha256(identity.encode()).hexdigest()

        with self.db.begin():
            student = self._find_student(phone)
            if student is None:
                return "ignored"
            student_id = student.id
            if self._exists(student_id, external_id):
                return "duplicate"
            courses = list(dict.fromkeys(
                name for _, name in self._enrollments(student_id) if len(name) <= 120
            ))[:50]

        result = await self.parser.parse(ParseTaskRequest(
            message=text,
            reference_time=event.received_at,
            timezone=LIMA.key,
            courses=courses,
        ))
        with self.db.begin():
            # Recheck binding after inference and serialize retries before contacting Evolution.
            current = self._find_student(phone, lock=True)
            if current is None or current.id != student_id:
                return "ignored"
            if self._exists(student_id, external_id):
                return "duplicate"
            if result.status == "needs_clarification":
                assert result.clarification is not None
                await self._confirm(phone, result.clarification)
                return "clarification"

            task = result.task
            assert task.title is not None and task.due_date is not None
            matches = [
                enrollment for enrollment, name in self._enrollments(student_id)
                if task.course and normalize_course_text(task.course) == normalize_course_text(name)
            ]
            enrollment = matches[0] if len(matches) == 1 else None
            self.db.add(ClassroomAssignment(
                user_id=student_id,
                course_code=enrollment.course_code if enrollment else None,
                enrollment_id=enrollment.id if enrollment else None,
                reported_course=task.course,
                classroom_assignment_id=external_id,
                title=task.title,
                due_date=task.due_date,
                state="PUBLISHED",
                origin="whatsapp",
            ))
            self.db.flush()
            await self._confirm(phone, confirmation_message(task.title, task.due_date))
            return "created"
