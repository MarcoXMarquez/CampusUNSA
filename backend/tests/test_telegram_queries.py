from unittest.mock import MagicMock
from uuid import UUID

from pytest import MonkeyPatch

from app.services.messaging.telegram import TelegramUpdate, build_telegram_reply


def test_telegram_group_is_ignored_without_database_access() -> None:
    db = MagicMock()
    update = TelegramUpdate.model_validate({
        "update_id": 12, "message": {"chat": {"id": -100, "type": "group"}, "text": "/tareas"},
    })
    assert build_telegram_reply(update, db, MagicMock()) is None
    db.query.assert_not_called()


def test_telegram_queries_only_the_bound_active_account(monkeypatch: MonkeyPatch) -> None:
    db = MagicMock()
    student = MagicMock(id=UUID(int=3))
    db.query.return_value.filter.return_value.first.return_value = student
    pending = MagicMock(return_value=[("Submit assignment", None)])
    monkeypatch.setattr("app.services.messaging.telegram.pending_tasks", pending)
    update = TelegramUpdate.model_validate({
        "update_id": 12, "message": {"chat": {"id": 123456, "type": "private"}, "text": "/tareas"},
    })
    reply = build_telegram_reply(update, db, MagicMock())
    assert reply is not None and "Submit assignment" in reply.text
    pending.assert_called_once_with(db, student.id)
