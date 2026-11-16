from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import re
import secrets
from typing import Any, Literal
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User

OtpChannel = Literal["whatsapp", "telegram"]

_DIGITS_ONLY_RE = re.compile(r"^\d{8,15}$")
_TELEGRAM_CHAT_ID_RE = re.compile(r"^-?\d{5,20}$")


class OtpError(Exception):
    """Base domain error for omnichannel OTP pairing."""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class InvalidChannelIdentifierError(OtpError):
    def __init__(self, channel: OtpChannel) -> None:
        detail = (
            "Invalid WhatsApp phone number. Use international E.164 format such as +51999888777."
            if channel == "whatsapp"
            else "Invalid Telegram chat identifier. Expected numeric chat ID."
        )
        super().__init__(code="INVALID_CHANNEL_IDENTIFIER", message=detail, status_code=400)


class OtpGenerationRateLimitError(OtpError):
    def __init__(self) -> None:
        super().__init__(
            code="OTP_GENERATION_RATE_LIMITED",
            message="Too many OTP requests. Please wait before generating another code.",
            status_code=429,
        )


class OtpExpiredError(OtpError):
    def __init__(self) -> None:
        super().__init__(
            code="OTP_EXPIRED",
            message="Code expired. Please generate a new code from the web portal",
            status_code=400,
        )


class InvalidOtpError(OtpError):
    def __init__(self, attempts_remaining: int) -> None:
        super().__init__(
            code="INVALID_OTP",
            message="Invalid OTP verification code.",
            status_code=400,
        )
        self.attempts_remaining = attempts_remaining


class OtpMaxAttemptsExceededError(OtpError):
    def __init__(self) -> None:
        super().__init__(
            code="OTP_MAX_ATTEMPTS_EXCEEDED",
            message="Maximum failed OTP attempts exceeded. Please generate a new code from the web portal.",
            status_code=429,
        )


class ChannelIdentifierConflictError(OtpError):
    def __init__(self, channel: OtpChannel) -> None:
        label = "WhatsApp phone number" if channel == "whatsapp" else "Telegram account"
        super().__init__(
            code="CHANNEL_IDENTIFIER_ALREADY_LINKED",
            message=f"This {label} is already linked to another student account.",
            status_code=409,
        )


class OTPService:
    """Manages 300-second HMAC-hashed OTPs in Redis and atomic PostgreSQL channel binding."""

    @staticmethod
    def _decode_redis_value(raw: Any) -> str | None:
        if raw is None:
            return None
        if isinstance(raw, bytes):
            return raw.decode("utf-8")
        return str(raw)

    @staticmethod
    def _user_key(user_id: uuid.UUID | str, channel: OtpChannel) -> str:
        return f"otp:user:{user_id}:{channel}"

    @staticmethod
    def _lookup_key(channel: OtpChannel, code_hash: str) -> str:
        return f"otp:lookup:{channel}:{code_hash}"

    @staticmethod
    def _rate_limit_key(user_id: uuid.UUID | str) -> str:
        return f"otp:gen_limit:{user_id}"

    @staticmethod
    def _hash_code(channel: OtpChannel, code: str) -> str:
        message = f"{channel}:otp:{code}".encode("utf-8")
        secret = settings.SECRET_KEY.encode("utf-8")
        return hmac.new(secret, message, hashlib.sha256).hexdigest()

    @classmethod
    def normalize_identifier(cls, channel: OtpChannel, raw_identifier: str) -> str:
        cleaned = (raw_identifier or "").strip()
        if channel == "whatsapp":
            cleaned = cleaned.split("@", 1)[0]
            digits = re.sub(r"\D", "", cleaned)
            if len(digits) == 9 and digits.startswith("9"):
                digits = f"51{digits}"
            if not _DIGITS_ONLY_RE.match(digits):
                raise InvalidChannelIdentifierError("whatsapp")
            return f"+{digits}"

        if not _TELEGRAM_CHAT_ID_RE.match(cleaned):
            raise InvalidChannelIdentifierError("telegram")
        return cleaned

    @staticmethod
    def _build_deep_link(channel: OtpChannel, otp_code: str) -> str | None:
        if channel == "whatsapp":
            digits = re.sub(r"\D", "", settings.WHATSAPP_BOT_NUMBER or "")
            if not digits:
                return None
            return f"https://wa.me/{digits}?text={otp_code}"

        username = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
        if not username:
            return None
        return f"https://t.me/{username}?start={otp_code}"

    @classmethod
    def _clear_active_keys(
        cls,
        redis_client: Any,
        *,
        user_id: uuid.UUID | str,
        channel: OtpChannel,
        code_hash: str | None = None,
    ) -> None:
        user_key = cls._user_key(user_id, channel)
        if code_hash is None:
            raw_existing = cls._decode_redis_value(redis_client.get(user_key))
            if raw_existing:
                try:
                    parsed = json.loads(raw_existing)
                    code_hash = parsed.get("code_hash")
                except (ValueError, TypeError):
                    code_hash = None
        if code_hash:
            redis_client.delete(user_key, cls._lookup_key(channel, code_hash))
        else:
            redis_client.delete(user_key)

    @classmethod
    def generate_otp(
        cls,
        redis_client: Any,
        *,
        user: User,
        channel: OtpChannel = "whatsapp",
    ) -> tuple[str, int, datetime, str | None]:
        rate_key = cls._rate_limit_key(user.id)
        request_count = int(redis_client.incr(rate_key))
        if request_count == 1:
            redis_client.expire(rate_key, settings.OTP_GENERATION_WINDOW_SECONDS)
        if request_count > settings.OTP_GENERATION_RATE_LIMIT:
            raise OtpGenerationRateLimitError()

        cls._clear_active_keys(redis_client, user_id=user.id, channel=channel)

        ttl_seconds = settings.OTP_TTL_SECONDS
        otp_code = ""
        code_hash = ""
        for _ in range(5):
            candidate = f"{secrets.randbelow(900000) + 100000}"
            candidate_hash = cls._hash_code(channel, candidate)
            if redis_client.get(cls._lookup_key(channel, candidate_hash)) is None:
                otp_code = candidate
                code_hash = candidate_hash
                break
        if not otp_code:
            otp_code = f"{secrets.randbelow(900000) + 100000}"
            code_hash = cls._hash_code(channel, otp_code)

        state_payload = json.dumps(
            {
                "channel": channel,
                "code_hash": code_hash,
                "attempts": 0,
            }
        )
        user_key = cls._user_key(user.id, channel)
        lookup_key = cls._lookup_key(channel, code_hash)
        pipeline_factory = getattr(redis_client, "pipeline", None)
        if callable(pipeline_factory):
            pipe = pipeline_factory(transaction=False)
            pipe.setex(name=user_key, time=ttl_seconds, value=state_payload)
            pipe.setex(name=lookup_key, time=ttl_seconds, value=str(user.id))
            pipe.execute()
        else:
            redis_client.setex(name=user_key, time=ttl_seconds, value=state_payload)
            redis_client.setex(name=lookup_key, time=ttl_seconds, value=str(user.id))

        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        deep_link_url = cls._build_deep_link(channel, otp_code)
        return otp_code, ttl_seconds, expires_at, deep_link_url

    @classmethod
    def verify_and_bind(
        cls,
        db: Session,
        redis_client: Any,
        *,
        channel: OtpChannel,
        identifier: str,
        submitted_code: str,
        user: User | None = None,
    ) -> tuple[User, str, str]:
        normalized_identifier = cls.normalize_identifier(channel, identifier)
        cleaned_code = (submitted_code or "").strip()
        submitted_hash = cls._hash_code(channel, cleaned_code)

        target_user = user
        if target_user is None:
            raw_user_id = cls._decode_redis_value(
                redis_client.get(cls._lookup_key(channel, submitted_hash))
            )
            if not raw_user_id:
                raise OtpExpiredError()
            try:
                parsed_user_id = uuid.UUID(raw_user_id)
            except ValueError as exc:
                raise OtpExpiredError() from exc
            target_user = db.query(User).filter(User.id == parsed_user_id).first()
            if target_user is None:
                raise OtpExpiredError()

        user_key = cls._user_key(target_user.id, channel)
        raw_state = cls._decode_redis_value(redis_client.get(user_key))
        if not raw_state:
            raise OtpExpiredError()

        try:
            state = json.loads(raw_state)
        except (ValueError, TypeError) as exc:
            cls._clear_active_keys(redis_client, user_id=target_user.id, channel=channel)
            raise OtpExpiredError() from exc

        expected_hash = str(state.get("code_hash", ""))
        attempts = int(state.get("attempts", 0))

        if not expected_hash or not hmac.compare_digest(expected_hash, submitted_hash):
            attempts += 1
            if attempts >= settings.OTP_MAX_ATTEMPTS:
                cls._clear_active_keys(
                    redis_client,
                    user_id=target_user.id,
                    channel=channel,
                    code_hash=expected_hash or None,
                )
                raise OtpMaxAttemptsExceededError()

            remaining_ttl = int(redis_client.ttl(user_key))
            ttl_to_keep = remaining_ttl if remaining_ttl > 0 else settings.OTP_TTL_SECONDS
            state["attempts"] = attempts
            redis_client.setex(name=user_key, time=ttl_to_keep, value=json.dumps(state))
            raise InvalidOtpError(attempts_remaining=settings.OTP_MAX_ATTEMPTS - attempts)

        if channel == "whatsapp":
            existing = db.query(User).filter(User.phone_number == normalized_identifier).first()
            if existing is not None and existing.id != target_user.id:
                raise ChannelIdentifierConflictError("whatsapp")
            target_user.phone_number = normalized_identifier
            welcome_message = "WhatsApp linked successfully to your CampusUNSA account."
        else:
            existing = db.query(User).filter(User.telegram_chat_id == normalized_identifier).first()
            if existing is not None and existing.id != target_user.id:
                raise ChannelIdentifierConflictError("telegram")
            target_user.telegram_chat_id = normalized_identifier
            welcome_message = "Telegram linked successfully to your CampusUNSA account."

        db.commit()
        cls._clear_active_keys(
            redis_client,
            user_id=target_user.id,
            channel=channel,
            code_hash=expected_hash,
        )
        return target_user, normalized_identifier, welcome_message

    @classmethod
    def verify_inbound_channel_otp(
        cls,
        db: Session,
        redis_client: Any,
        *,
        channel: OtpChannel,
        identifier: str,
        submitted_code: str,
    ) -> User:
        """Reusable entrypoint for US-09 webhooks validating inbound bot OTP messages."""
        bound_user, _, _ = cls.verify_and_bind(
            db=db,
            redis_client=redis_client,
            channel=channel,
            identifier=identifier,
            submitted_code=submitted_code,
            user=None,
        )
        return bound_user

    @classmethod
    def get_status(cls, redis_client: Any, *, user: User) -> dict[str, Any]:
        wa_key = cls._user_key(user.id, "whatsapp")
        tg_key = cls._user_key(user.id, "telegram")
        pipeline_factory = getattr(redis_client, "pipeline", None)
        if callable(pipeline_factory):
            pipe = pipeline_factory(transaction=False)
            pipe.ttl(wa_key)
            pipe.ttl(tg_key)
            raw_wa_ttl, raw_tg_ttl = pipe.execute()
            wa_ttl = max(0, int(raw_wa_ttl))
            tg_ttl = max(0, int(raw_tg_ttl))
        else:
            wa_ttl = max(0, int(redis_client.ttl(wa_key)))
            tg_ttl = max(0, int(redis_client.ttl(tg_key)))
        return {
            "whatsapp_connected": bool(user.phone_number),
            "whatsapp_phone": user.phone_number,
            "telegram_connected": bool(user.telegram_chat_id),
            "telegram_chat_id": user.telegram_chat_id,
            "pending_whatsapp_ttl": wa_ttl,
            "pending_telegram_ttl": tg_ttl,
        }

    @classmethod
    def unlink_channel(
        cls,
        db: Session,
        redis_client: Any,
        *,
        user: User,
        channel: OtpChannel,
    ) -> None:
        if channel == "whatsapp":
            user.phone_number = None
        else:
            user.telegram_chat_id = None
        db.commit()
        cls._clear_active_keys(redis_client, user_id=user.id, channel=channel)
