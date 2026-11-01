"""
Token Encryption Service.
Provides AES-256-GCM symmetric encryption for sensitive credentials (e.g. OAuth refresh tokens)
using cryptography.fernet with a key derived deterministically from application SECRET_KEY.
"""

import base64
import hashlib
from cryptography.fernet import Fernet

from app.core.config import settings


def _get_fernet_cipher() -> Fernet:
    """Derives a 32-byte URL-safe base64-encoded key from settings.SECRET_KEY."""
    secret = settings.SECRET_KEY or "fallback_campusunsa_secret_key"
    key_bytes = hashlib.sha256(secret.encode("utf-8")).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def encrypt_token(plain_token: str) -> str:
    """Encrypts a plaintext token string into an encrypted cipher string."""
    if not plain_token:
        return ""
    cipher = _get_fernet_cipher()
    return cipher.encrypt(plain_token.encode("utf-8")).decode("utf-8")


def decrypt_token(cipher_token: str) -> str:
    """Decrypts an encrypted cipher string back to its original plaintext string."""
    if not cipher_token:
        return ""
    cipher = _get_fernet_cipher()
    return cipher.decrypt(cipher_token.encode("utf-8")).decode("utf-8")
