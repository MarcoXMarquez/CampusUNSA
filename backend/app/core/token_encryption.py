"""
Token Encryption Service.
Provides symmetric encryption for sensitive credentials (e.g. OAuth refresh tokens)
using cryptography.fernet.MultiFernet keyed primarily by settings.ENCRYPTION_KEY,
with optional fallback decryption for legacy tokens encrypted under SECRET_KEY.
"""

import base64
import hashlib
from cryptography.fernet import Fernet, MultiFernet

from app.core.config import settings


def _derive_fernet(secret: str) -> Fernet:
    """Derives a 32-byte URL-safe base64-encoded Fernet instance from a secret string."""
    key_bytes = hashlib.sha256(secret.encode("utf-8")).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def _get_fernet_cipher() -> MultiFernet:
    """Builds a MultiFernet cipher keyed primarily by settings.ENCRYPTION_KEY."""
    encryption_key = settings.ENCRYPTION_KEY.strip()
    if not encryption_key:
        raise ValueError("ENCRYPTION_KEY must not be empty")
    ciphers = [_derive_fernet(encryption_key)]
    legacy_secret = settings.SECRET_KEY.strip()
    if legacy_secret and legacy_secret != encryption_key:
        ciphers.append(_derive_fernet(legacy_secret))
    return MultiFernet(ciphers)


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
