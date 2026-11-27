"""Explicit separation of public reports from private claim data."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.lost_found_media import MAX_PHOTO_BASE64

Campus = Literal["engineering", "social", "biomedical"]
ItemStatus = Literal["open", "reserved", "returned"]
ClaimStatus = Literal["pending", "approved", "rejected"]


class LostReportCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    title: str = Field(min_length=3, max_length=100)
    description: str = Field(min_length=3, max_length=500)
    location: str = Field(min_length=3, max_length=160)
    campus: Campus
    found_on: date
    request_id: UUID
    photo_base64: str = Field(min_length=4, max_length=MAX_PHOTO_BASE64)

    @field_validator("found_on")
    @classmethod
    def prohibit_future_date(cls, value: date) -> date:
        if value > datetime.now(ZoneInfo("America/Lima")).date():
            raise ValueError("The found date cannot be in the future")
        return value


class LostItemPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str
    location: str
    campus: Campus
    found_on: date
    status: ItemStatus


class LostClaimCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    proof: str = Field(min_length=8, max_length=500)


class LostClaimReview(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    decision: Literal["approved", "rejected"]
    pickup: str | None = Field(default=None, min_length=8, max_length=500)

    @model_validator(mode="after")
    def require_private_pickup_for_approval(self) -> "LostClaimReview":
        if (self.decision == "approved") != (self.pickup is not None):
            raise ValueError("Provide private pickup instructions only on approval")
        return self


class LostItemReturn(BaseModel):
    status: Literal["returned"]


class LostClaimPrivate(BaseModel):
    id: UUID
    item_id: UUID
    item_title: str
    item_status: ItemStatus
    proof: str
    status: ClaimStatus
    pickup: str | None
    is_reporter: bool
