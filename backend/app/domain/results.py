"""Result shapes returned by image-producing services.

Every operation that renders a file returns an :class:`OperationResult`. The
important property is the split between the fields a client is allowed to see
and the ones it must never see: ``path`` and ``filename`` are server-side
bookkeeping, and before this type existed they were stripped from responses by
hand-written comprehensions in a dozen routes (``if key != "path"``). Getting
that filter wrong in one place leaked an absolute filesystem path to the
client. Here the public contract is declared once, and serialization goes
through :meth:`to_public_dict`, which only ever emits the allowlist — there is
no ``path`` attribute on the returned mapping to leak by accident.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class OperationResult:
    """The outcome of rendering an image for a session.

    ``path`` is the rendered file on disk. It is deliberately excluded from
    :meth:`to_public_dict`; routes that need to stream the file read the
    attribute directly, and everything else sees only the public view.
    """

    image_id: str
    width: int
    height: int
    format: str
    mime_type: str
    path: Path | None = None
    filename: str = ""
    # Operation-specific extras that are safe to expose (e.g. the chosen
    # background, applied parameters). Never used for internal bookkeeping.
    public_extras: dict[str, Any] = field(default_factory=dict)

    def to_public_dict(self) -> dict[str, Any]:
        """Return the client-safe view of this result.

        This is the single source of truth for what an image response may
        contain. ``path`` is structurally absent, so a route cannot leak it
        even by forgetting a filter.
        """
        payload: dict[str, Any] = {
            "image_id": self.image_id,
            "width": self.width,
            "height": self.height,
            "format": self.format,
            "mime_type": self.mime_type,
        }
        if self.filename:
            payload["filename"] = self.filename
        payload.update(self.public_extras)
        return payload
