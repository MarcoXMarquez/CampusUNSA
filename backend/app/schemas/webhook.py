"""Evolution API inbound message and durable queue contracts."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator

Identifier = Annotated[str, Field(min_length=1, max_length=512)]


class WhatsAppMessageKey(BaseModel):
    model_config = ConfigDict(strict=True, str_strip_whitespace=True, extra="allow")

    id: Identifier
    remoteJid: Identifier
    fromMe: bool


class WhatsAppMessageData(BaseModel):
    model_config = ConfigDict(strict=True, extra="allow")

    key: WhatsAppMessageKey
    message: dict[str, JsonValue] = Field(min_length=1)


class EvolutionMessageEvent(BaseModel):
    model_config = ConfigDict(strict=True, str_strip_whitespace=True)

    event: Literal["messages.upsert"]
    instance: Identifier
    data: WhatsAppMessageData

    @field_validator("event", mode="before")
    @classmethod
    def normalize_event(cls, value: object) -> object:
        return value.lower().replace("_", ".") if isinstance(value, str) else value


class QueuedWhatsAppEvent(BaseModel):
    version: Literal[1] = 1
    received_at: datetime
    payload: EvolutionMessageEvent


class DeadLetterWebhook(BaseModel):
    version: Literal[1] = 1
    received_at: datetime
    reason: Literal["INVALID_PAYLOAD", "INVALID_JSON"]
    payload: JsonValue = None
    body_sha256: str | None = None


class WebhookAcknowledgment(BaseModel):
    status: Literal["queued", "duplicate", "ignored", "dead_lettered"]
