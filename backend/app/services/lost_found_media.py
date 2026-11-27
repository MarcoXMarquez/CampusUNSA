"""Validate images and keep storage credentials and original metadata server-side."""

import base64
import binascii
import logging
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from PIL import Image, ImageOps

from app.core.config import settings

MAX_PHOTO_BYTES = 4 * 1024 * 1024
MAX_PHOTO_BASE64 = ((MAX_PHOTO_BYTES + 2) // 3) * 4
MAX_IMAGE_PIXELS = 20_000_000
logger = logging.getLogger(__name__)


class InvalidPhoto(ValueError):
    """The supplied bytes are not a supported, bounded photograph."""


class MediaUnavailable(RuntimeError):
    """The configured media store could not serve the request."""


def prepare_photo(encoded: str) -> tuple[bytes, bytes]:
    if len(encoded) > MAX_PHOTO_BASE64:
        raise InvalidPhoto("Image exceeds the byte limit")
    try:
        data = base64.b64decode(encoded, validate=True)
        if len(data) > MAX_PHOTO_BYTES:
            raise InvalidPhoto("Image exceeds the byte limit")
        with Image.open(BytesIO(data), formats=("JPEG", "PNG", "WEBP")) as original:
            if original.width * original.height > MAX_IMAGE_PIXELS or getattr(original, "n_frames", 1) != 1:
                raise InvalidPhoto("Image exceeds the pixel or frame limit")
            original.draft("RGB", (1600, 1600))
            ImageOps.exif_transpose(original, in_place=True)
            oriented = original
            oriented.thumbnail((1600, 1600))
            sanitized = Image.new("RGB", oriented.size, "white")
            if "A" in oriented.getbands() or "transparency" in oriented.info:
                rgba = oriented.convert("RGBA")
                sanitized.paste(rgba, mask=rgba.getchannel("A"))
            else:
                sanitized.paste(oriented.convert("RGB"))
            with BytesIO() as full, BytesIO() as thumbnail:
                sanitized.save(full, "JPEG", quality=85, optimize=True)
                if max(sanitized.size) <= 320:
                    data = full.getvalue()
                    return data, data
                sanitized.thumbnail((320, 320))
                sanitized.save(thumbnail, "JPEG", quality=78, optimize=True)
                return full.getvalue(), thumbnail.getvalue()
    except (binascii.Error, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as exc:
        raise InvalidPhoto("Use a static JPEG, PNG, or WebP up to 4 MB and 20 megapixels") from exc


def _store() -> tuple[str, dict[str, str]] | Path:
    origin = settings.LOST_FOUND_STORAGE_URL.rstrip("/")
    key = settings.LOST_FOUND_STORAGE_SERVICE_KEY.get_secret_value()
    if origin:
        parsed = urlsplit(origin)
        if (
            parsed.scheme == "https" and parsed.hostname and not parsed.username
            and not parsed.password and not parsed.path and not parsed.query
            and not parsed.fragment and key
        ):
            endpoint = f"{origin}/storage/v1/object"
            return endpoint, {"Authorization": f"Bearer {key}", "apikey": key}
        raise MediaUnavailable("Invalid lost and found storage configuration")
    if settings.LOST_FOUND_MEDIA_DIR and settings.ENVIRONMENT.lower() in {"development", "testing", "performance"}:
        return Path(settings.LOST_FOUND_MEDIA_DIR)
    raise MediaUnavailable("Lost and found storage is not configured")


def _object_key(item_id: UUID, thumbnail: bool) -> str:
    return f"{item_id}/{'thumbnail.jpg' if thumbnail else 'photo.jpg'}"


def store_photos(item_id: UUID, images: tuple[bytes, bytes]) -> None:
    store = _store()
    keys = [_object_key(item_id, thumbnail) for thumbnail in (False, True)]
    try:
        if isinstance(store, Path):
            for key, content in zip(keys, images, strict=True):
                target = store / key
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
        else:
            endpoint, headers = store
            with httpx.Client(timeout=4, trust_env=False) as client:
                for key, content in zip(keys, images, strict=True):
                    client.post(
                        f"{endpoint}/{settings.LOST_FOUND_STORAGE_BUCKET}/{key}",
                        content=content,
                        headers={**headers, "Content-Type": "image/jpeg", "x-upsert": "true"},
                    ).raise_for_status()
    except (OSError, httpx.HTTPError) as exc:
        try:
            if isinstance(store, Path):
                for key in keys:
                    (store / key).unlink(missing_ok=True)
            else:
                endpoint, headers = store
                with httpx.Client(timeout=4, trust_env=False) as client:
                    client.request(
                        "DELETE", f"{endpoint}/{settings.LOST_FOUND_STORAGE_BUCKET}",
                        headers=headers, json={"prefixes": keys},
                    ).raise_for_status()
        except (OSError, httpx.HTTPError):
            logger.warning("Could not clean up unpublished media for item %s", item_id)
        raise MediaUnavailable("Could not save the photo") from exc


def load_photo(item_id: UUID, thumbnail: bool) -> bytes:
    store = _store()
    key = _object_key(item_id, thumbnail)
    try:
        if isinstance(store, Path):
            return (store / key).read_bytes()
        endpoint, headers = store
        with httpx.Client(timeout=4, trust_env=False) as client:
            return client.get(
                f"{endpoint}/authenticated/{settings.LOST_FOUND_STORAGE_BUCKET}/{key}",
                headers=headers,
            ).raise_for_status().content
    except (httpx.HTTPError, OSError) as exc:
        raise MediaUnavailable("Could not read the photo") from exc
