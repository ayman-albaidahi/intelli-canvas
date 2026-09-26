"""A step in an image session's edit history.

History entries are stored one row per edit (upload, operation, undo/redo
landing point). Two different code paths read those rows and used to shape
them differently — ``_history()`` emitted ``index``/``time`` while
``get_history_entry()`` leaked the raw column names ``history_index`` and
``created_at`` — so consumers indexing into the result had to know which
method produced the dict they were holding. Capturing the shape once here
makes both boundaries return the same thing.

``filename`` and ``storage`` are server-side bookkeeping: they locate the
rendered file on disk and are never sent to the client. ``to_public_dict``
omits them for the same reason ``OperationResult`` omits ``path`` — a route
that wants the file reads the attribute, and everything else sees only the
public view.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class HistoryEntry:
    """One editable step in a session's history."""

    index: int
    operation: str
    filename: str
    storage: str
    created_at: int
    parameters: dict[str, Any] = field(default_factory=dict)

    def to_public_dict(self) -> dict[str, Any]:
        """The client view of this step.

        Excludes ``filename`` and ``storage``: they are filesystem pointers a
        client has no use for and should never see.
        """
        return {
            "index": self.index,
            "operation": self.operation,
            "time": self.created_at,
            "parameters": self.parameters,
        }
