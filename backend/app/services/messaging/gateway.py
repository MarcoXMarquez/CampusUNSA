from __future__ import annotations

import logging
from typing import Protocol

import httpx

logger = logging.getLogger(__name__)


class MessagingGatewayProtocol(Protocol):
    """Outbound text messaging port decoupling domain logic from provider APIs."""

    async def send_text(self, recipient: str, message_text: str) -> bool:
        """Dispatches a plain-text message to the given recipient identifier."""
        ...


class EvolutionWhatsAppGateway:
    """Adapter for Evolution API v2 outbound WhatsApp text dispatch."""

    def __init__(self, *, base_url: str, instance_name: str, api_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.instance_name = instance_name
        self.api_key = api_key

    async def send_text(self, recipient: str, message_text: str) -> bool:
        url = f"{self.base_url}/message/sendText/{self.instance_name}"
        clean_number = recipient.strip().lstrip("+")
        payload = {"number": clean_number, "text": message_text}
        headers = {
            "apikey": self.api_key,
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=headers)
            return response.status_code in (200, 201)
        except httpx.HTTPError as exc:
            logger.warning("Evolution API send_text failed (%s)", type(exc).__name__)
            return False


class TelegramBotGateway:
    """Adapter for official Telegram Bot API outbound text dispatch."""

    def __init__(self, *, bot_token: str) -> None:
        self.bot_token = bot_token

    async def send_text(self, recipient: str, message_text: str) -> bool:
        if not self.bot_token:
            return False
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload = {"chat_id": recipient, "text": message_text}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
            return response.status_code == 200
        except httpx.HTTPError as exc:
            logger.warning("Telegram Bot API send_text failed: %s", exc)
            return False
