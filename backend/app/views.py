"""Response shaping for API payloads.

Service results carry internal bookkeeping keys (notably ``path``, an absolute
server filesystem path) that must never reach the client. Historically every
route stripped those keys by hand — sometimes with ``!= "path"``, sometimes
with ``not in {"path"}`` — so any new internal key would leak straight into a
JSON response. This module centralizes the allowlist so the filter is applied
in one place.
"""

from __future__ import annotations

from typing import Any

# Keys a service result may legally return but the client must never see.
INTERNAL_KEYS = frozenset({"path"})

# Public fields defining the image contract clients depend on.
PUBLIC_IMAGE_KEYS = frozenset(
    {
        "image_id",
        "width",
        "height",
        "format",
        "mime_type",
        "filename",
        "original_filename",
        "size",
        "index",
        "current_filename",
    }
)


def public_view(result: dict[str, Any], *, internal: frozenset[str] = INTERNAL_KEYS) -> dict[str, Any]:
    """Drop internal bookkeeping keys from a service result.

    Prefer this over hand-written comprehensions in routes: the set of keys
    considered secret lives here, so adding a new internal field only needs
    one edit.
    """
    return {key: value for key, value in result.items() if key not in internal}


def public_image(result: Any) -> dict[str, Any]:
    """Shape a service image result for an API response.

    Accepts a mapping or any object exposing ``__dict__``; unknown shapes pass
    through untouched so callers that return a plain ``dict`` of extra fields
    still work.
    """
    if isinstance(result, dict):
        return public_view(result)
    return result
