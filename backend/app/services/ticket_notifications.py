"""Send committed resolution notices through Evolution and retry failures."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.ticket import TicketNotification
from app.models.user import User
from app.services.messaging.gateway import MessagingGatewayProtocol

logger = logging.getLogger(__name__)


async def send_resolution(
    gateway: MessagingGatewayProtocol, phone: str, tracking_code: str,
) -> bool:
    try:
        async with asyncio.timeout(12):
            return await gateway.send_text(
                phone, f"Secretarial ticket {tracking_code} has been resolved. View the resolution in CampusUNSA.",
            )
    except Exception as error:
        logger.warning("Ticket WhatsApp delivery failed (%s)", type(error).__name__)
        return False


def dispatch_ticket_notification(db: Session, gateway: MessagingGatewayProtocol) -> bool:
    """Claim one due job without blocking concurrent workers or exposing private resolution text."""
    now = datetime.now(timezone.utc)
    notice = db.scalar(
        select(TicketNotification)
        .where(TicketNotification.whatsapp_sent_at.is_(None), TicketNotification.next_attempt_at <= now)
        .order_by(TicketNotification.next_attempt_at, TicketNotification.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if notice is None:
        db.rollback()
        return False
    phone = db.scalar(select(User.phone_number).where(
        User.id == notice.student_id, User.role == "student", User.is_active.is_(True),
    ).with_for_update(of=User))
    if not phone:
        notice.next_attempt_at = now + timedelta(hours=1)
    elif asyncio.run(send_resolution(gateway, phone, notice.tracking_code)):
        notice.whatsapp_sent_at = datetime.now(timezone.utc)
    else:
        notice.attempts += 1
        notice.next_attempt_at = now + timedelta(seconds=min(3600, 2 ** min(notice.attempts, 12)))
    db.commit()
    return True


def run_delivery_cycle(gateway: MessagingGatewayProtocol) -> bool:
    with SessionLocal() as db:
        return dispatch_ticket_notification(db, gateway)


async def run_ticket_notice_worker(gateway: MessagingGatewayProtocol, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            if await asyncio.to_thread(run_delivery_cycle, gateway):
                continue
        except SQLAlchemyError as error:
            logger.warning("Ticket notification store unavailable (%s)", type(error).__name__)
        try:
            await asyncio.wait_for(stop.wait(), timeout=1)
        except TimeoutError:
            pass
