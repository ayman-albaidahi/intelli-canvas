"""An image editing session.

A session is the spine of the editor: it pins the uploaded original, tracks
which rendered file is currently displayed, and owns the history index plus
the persisted layer list. Before this type the repository returned a raw
``SELECT *`` row and 17 call sites reached in with ``session.get(...)``; the
row's column names and the service contract were the same thing, so a
renamed column silently broke a service at runtime instead of failing at
import.

The fields promoted to attributes are the ones read by name across services
and routes (``current_filename`` is touched in nine places). The remainder of
the row stays in ``payload`` and is reached through :meth:`get`, because a
session carries bookkeeping only one or two consumers ever read and promoting
all of it would freeze the schema into the model. ``history`` and ``layers``
hold typed domain objects, not raw dicts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .history import HistoryEntry
from .layer import Layer


@dataclass(frozen=True)
class ImageSession:
    """One image's editing state."""

    image_id: str
    current_filename: str = ""
    current_storage: str = "uploads"
    base_stem: str = "image"
    history_index: int = 0
    project_id: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    history: tuple[HistoryEntry, ...] = ()
    layers: tuple[Layer, ...] = ()

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> ImageSession:
        """Build a session from a repository row plus its nested collections.

        ``row`` is the ``image_sessions`` record; ``history`` and ``layers``
        are loaded separately by the repository and are already typed, so
        they are threaded through rather than re-derived from the row.
        """
        return cls(
            image_id=row["image_id"],
            current_filename=row.get("current_filename") or "",
            current_storage=row.get("current_storage") or "uploads",
            base_stem=row.get("base_stem") or "image",
            history_index=int(row.get("history_index") or 0),
            project_id=row.get("project_id"),
            payload=dict(row),
            history=tuple(row.get("history") or ()),
            layers=tuple(row.get("layers") or ()),
        )

    def get(self, key: str, default: Any = None) -> Any:
        """Read a session row field the model does not promote.

        This is the sanctioned accessor for the long tail of columns only one
        consumer reads (``stored_filename``, ``mime_type``, ``created_at``).
        Funneling them through here keeps ``payload`` from leaking as a public
        attribute callers index directly.
        """
        return self.payload.get(key, default)
