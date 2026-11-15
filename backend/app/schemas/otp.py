from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

OtpChannel = Literal["whatsapp", "telegram"]


class OtpGenerateRequest(BaseModel):
    """Request payload to generate a 5-minute channel pairing OTP."""

    channel: OtpChannel = "whatsapp"


class OtpGenerateResponse(BaseModel):
    """Response containing the generated 6-digit OTP and channel metadata."""

    channel: OtpChannel
    otp_code: str = Field(..., min_length=6, max_length=6)
    expires_in_seconds: int
    expires_at: datetime
    deep_link_url: Optional[str] = None
    status: Literal["PENDING"] = "PENDING"


class OtpVerifyRequest(BaseModel):
    """Request payload to verify a 6-digit OTP and bind a channel identifier."""

    channel: OtpChannel = "whatsapp"
    code: str = Field(..., min_length=1, max_length=16)
    identifier: str = Field(..., min_length=1, max_length=64)


class OtpVerifyResponse(BaseModel):
    """Response emitted after successful OTP verification and persistence."""

    channel: OtpChannel
    identifier: str
    linked: bool = True
    message: str


class OtpStatusResponse(BaseModel):
    """Current WhatsApp and Telegram linkage status plus pending OTP TTLs."""

    whatsapp_connected: bool
    whatsapp_phone: Optional[str] = None
    telegram_connected: bool
    telegram_chat_id: Optional[str] = None
    pending_whatsapp_ttl: int = 0
    pending_telegram_ttl: int = 0


class OtpUnlinkResponse(BaseModel):
    """Response confirming removal of a linked messaging channel."""

    channel: OtpChannel
    linked: bool = False
    message: str
