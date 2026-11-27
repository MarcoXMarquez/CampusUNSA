"""Answer student task queries from an authenticated Telegram update."""

import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field
from redis import Redis
from sqlalchemy.orm import Session

from app.models.classroom import ClassroomAssignment
from app.models.user import User
from app.services.academic.schedule_calculator import LIMA_TIMEZONE
from app.services.messaging.otp_service import OTPService, OtpError


class TelegramChat(BaseModel):
    id: int
    type: str


class TelegramMessage(BaseModel):
    chat: TelegramChat
    text: str | None = Field(default=None, max_length=4096)


class TelegramUpdate(BaseModel):
    update_id: int
    message: TelegramMessage | None = None


class TelegramReply(BaseModel):
    method: Literal["sendMessage"] = "sendMessage"
    chat_id: int
    text: str


def pending_tasks(db: Session, user_id: uuid.UUID) -> list[tuple[str, datetime | None]]:
    assignments = (
        db.query(ClassroomAssignment.title, ClassroomAssignment.due_date)
        .filter(ClassroomAssignment.user_id == user_id, ClassroomAssignment.is_completed.is_(False))
        .order_by(ClassroomAssignment.due_date.asc().nullslast(), ClassroomAssignment.id)
        .limit(10)
        .all()
    )
    return [(title, due_date) for title, due_date in assignments]


def build_telegram_reply(update: TelegramUpdate, db: Session, redis: Redis) -> TelegramReply | None:
    message = update.message
    if not message or message.chat.type != "private" or not message.text:
        return None
    parts = message.text.strip().split(maxsplit=1)
    if not parts:
        return None
    command = parts[0].split("@", 1)[0].casefold()
    chat_id = message.chat.id

    if command == "/start" and len(parts) == 2:
        try:
            OTPService.verify_inbound_channel_otp(
                db, redis, channel="telegram", identifier=str(chat_id), submitted_code=parts[1],
            )
        except OtpError:
            text = "El código es inválido o venció. Genera uno nuevo en CampusUNSA."
        else:
            text = "Telegram vinculado a CampusUNSA. Usa /tareas para ver tus pendientes."
        return TelegramReply(chat_id=chat_id, text=text)

    if command not in ("/tareas", "/tasks"):
        return TelegramReply(chat_id=chat_id, text="Usa /tareas para ver tus pendientes.")
    student = db.query(User).filter(
        User.telegram_chat_id == str(chat_id), User.is_active.is_(True), User.role == "student",
    ).first()
    if student is None:
        return TelegramReply(chat_id=chat_id, text="Vincula Telegram en CampusUNSA para consultar tus tareas.")

    lines = []
    for title, due in pending_tasks(db, student.id):
        line = " ".join(title.split())[:180]
        if due:
            normalized = due if due.tzinfo else due.replace(tzinfo=timezone.utc)
            line += " - " + normalized.astimezone(LIMA_TIMEZONE).strftime("%d/%m %H:%M")
        lines.append(line)
    text = "Tareas pendientes (hora de Lima):\n" + "\n".join(lines) if lines else "No tienes tareas pendientes."
    return TelegramReply(chat_id=chat_id, text=text)
