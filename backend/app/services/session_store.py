from __future__ import annotations

from copy import deepcopy
from typing import Any, Protocol


class SessionStore(Protocol):
    """Minimal persistence seam required by image-session consumers."""

    def get(self, image_id: str) -> dict[str, Any] | None: ...

    def set(self, image_id: str, data: dict[str, Any]) -> None: ...

    def delete(self, image_id: str) -> None: ...

    def list_ids(self) -> list[str]: ...


class InMemorySessionStore:
    """Small dict-backed store useful for isolated tests and future adapters."""

    def __init__(self, initial: dict[str, dict[str, Any]] | None = None):
        self._sessions = deepcopy(initial or {})

    def get(self, image_id: str) -> dict[str, Any] | None:
        value = self._sessions.get(image_id)
        return deepcopy(value) if value is not None else None

    def set(self, image_id: str, data: dict[str, Any]) -> None:
        self._sessions[image_id] = deepcopy(data)

    def delete(self, image_id: str) -> None:
        self._sessions.pop(image_id, None)

    def list_ids(self) -> list[str]:
        return list(self._sessions)
