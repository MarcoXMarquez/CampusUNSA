"""Publication metadata and evidence-only public answers."""

from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

Category = Literal["enrollment", "academic", "graduation", "admissions", "other"]


class RegulationUpload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    title: str = Field(min_length=5, max_length=180)
    resolution: str = Field(pattern=r"^[0-9]{1,6}-20[0-9]{2}$")
    category: Category
    source_url: str = Field(max_length=1000)

    @field_validator("source_url")
    @classmethod
    def validate_official_url(cls, value: str) -> str:
        origin = urlsplit(value)
        host = origin.hostname or ""
        if (
            origin.scheme != "https" or origin.username is not None or origin.password is not None
            or origin.port not in (None, 443) or not origin.path or origin.fragment
            or (host != "unsa.edu.pe" and not host.endswith(".unsa.edu.pe"))
            or any(ord(character) < 33 for character in value)
            or "\\" in value
        ):
            raise ValueError("Provide an official UNSA HTTPS document URL")
        return value


class RegulationDocument(RegulationUpload):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    active: bool
    page_count: int
    article_count: int
    created_at: datetime


class RegulationStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    active: bool


class RegulationQuestion(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    question: str = Field(min_length=5, max_length=500)


class RegulationCitation(BaseModel):
    title: str
    resolution: str
    article: str
    page: int
    source_url: str


class RegulationAnswer(BaseModel):
    status: Literal["answered", "not_found"]
    answer: str | None = None
    citation: RegulationCitation | None = None
    message: str | None = None
    offer_ticket: bool = False
