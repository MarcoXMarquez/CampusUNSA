"""Issue and revoke links to a student's dynamic academic schedule."""

from datetime import date, datetime, timedelta, timezone
from secrets import token_urlsafe
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import _resolve_authenticated_user
from app.core.database import get_db
from app.models.user import User
from app.repositories.academic_repo import AcademicSyncRepository
from app.services.academic.calendar_feed import build_calendar, feed_digest
from app.services.academic.curriculum_resolver import DEFAULT_TERM
from app.services.academic.schedule_calculator import LIMA_TIMEZONE, ScheduleCalculator

router = APIRouter()
_PRIVATE = {"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"}


class CalendarSubscriptionRequest(BaseModel):
    ends_on: date


class CalendarSubscriptionResponse(BaseModel):
    path: str


@router.post("/subscription", response_model=CalendarSubscriptionResponse)
def create_subscription(
    payload: CalendarSubscriptionRequest,
    response: Response,
    user: Annotated[User, Depends(_resolve_authenticated_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CalendarSubscriptionResponse:
    today = datetime.now(LIMA_TIMEZONE).date()
    if not today <= payload.ends_on <= today + timedelta(days=180):
        raise HTTPException(422, detail="Calendar end date must be within the next 180 days.")
    token = token_urlsafe(32)
    user.calendar_feed_hash = feed_digest(token)
    user.calendar_feed_start = today
    user.calendar_feed_end = payload.ends_on
    db.commit()
    response.headers.update(_PRIVATE)
    return CalendarSubscriptionResponse(path=f"/courses/calendar/{token}.ics")


@router.delete("/subscription", status_code=204)
def revoke_subscription(
    user: Annotated[User, Depends(_resolve_authenticated_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user.calendar_feed_hash = None
    user.calendar_feed_start = None
    user.calendar_feed_end = None
    db.commit()
    return Response(status_code=204, headers=_PRIVATE)


@router.get("/{token}.ics", response_class=Response, responses={200: {"content": {"text/calendar": {}}}})
def calendar_feed(
    token: Annotated[str, Path(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    user = db.query(User).filter(User.calendar_feed_hash == feed_digest(token), User.is_active.is_(True)).first()
    if user is None or user.calendar_feed_start is None or user.calendar_feed_end is None:
        raise HTTPException(404, detail="Calendar subscription not found.", headers=_PRIVATE)
    courses = AcademicSyncRepository.list_courses(db, user.id, include_pending=False)
    schedule = ScheduleCalculator.build_weekly_schedule(courses)
    body = build_calendar(
        (slot for day in schedule.days for slot in day.sessions if slot.term == DEFAULT_TERM),
        user.calendar_feed_start,
        user.calendar_feed_end,
        datetime.now(timezone.utc),
    )
    return Response(content=body, media_type="text/calendar; charset=utf-8", headers=_PRIVATE)
