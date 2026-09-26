from __future__ import annotations

from typing import Any, Protocol

from backend.app.domain.history import HistoryEntry
from backend.app.domain.pipeline import Pipeline
from backend.app.domain.session import ImageSession


class SessionStore(Protocol):
    """The persistence seam an ImageSessionService is wired against.

    Declares the methods the service actually calls. The previous version
    advertised get/set/delete/list_ids — a narrower dict-store shape the
    service never used — so the annotation did not describe the real
    contract and a stand-in implementing only those four could not satisfy
    it. Keeping this in sync with SQLiteSessionRepository is what makes the
    repository substitutable at the seam; drift here silently breaks it.
    """

    def create_session(self, payload: dict[str, Any]) -> ImageSession: ...

    def get_session(self, image_id: str) -> ImageSession | None: ...

    def list_ids(self) -> list[str]: ...

    def list_sessions(self) -> list[ImageSession]: ...

    def update_current_image(
        self,
        image_id: str,
        filename: str,
        storage: str,
        operation: str | None,
        now: int,
    ) -> ImageSession: ...

    def set_current_history(
        self, image_id: str, index: int, now: int
    ) -> ImageSession: ...

    def clear_history(self, image_id: str, now: int) -> ImageSession: ...

    def save_layers(
        self, image_id: str, layers: list[dict[str, Any]], now: int
    ) -> list[dict[str, Any]]: ...

    def get_layers(self, image_id: str) -> list[dict[str, Any]]: ...

    def get_history_entry(self, image_id: str, index: int) -> HistoryEntry | None: ...

    def get_pipeline(self, image_id: str) -> Pipeline | None: ...

    def save_pipeline(
        self, image_id: str, nodes: list[dict[str, Any]], version: int, now: int
    ) -> Pipeline: ...
