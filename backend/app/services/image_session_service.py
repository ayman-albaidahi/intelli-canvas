from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any

from werkzeug.utils import secure_filename

from .session_store import SessionStore

MAX_BASE_STEM_LENGTH = 60


class ImageSessionService:
    """Persistent image-session service backed by SQLite."""

    def __init__(self, repository: SessionStore):
        self.repository = repository

    def create_session(self, metadata: dict[str, Any]) -> dict[str, Any]:
        image_id = uuid.uuid4().hex
        while image_id in self.repository.list_ids():
            image_id = uuid.uuid4().hex
        now = int(time.time())
        payload = {
            "image_id": image_id,
            **metadata,
            "base_stem": self._base_stem(metadata.get("original_filename")),
            "current_filename": metadata.get("stored_filename"),
            "current_storage": "uploads",
            "created_at": now,
            "updated_at": now,
        }
        return self.repository.create_session(payload)

    def _base_stem(self, original_filename: Any) -> str:
        stem = Path(str(original_filename or "")).stem
        sanitized = secure_filename(stem)
        return (sanitized or "image")[:MAX_BASE_STEM_LENGTH]

    def list_sessions(self) -> list[dict[str, Any]]:
        return self.repository.list_sessions()

    def get_session(self, image_id: str) -> dict[str, Any] | None:
        return self.repository.get_session(image_id)

    def get_layers(self, image_id: str) -> list[dict[str, Any]]:
        return self.repository.get_layers(image_id)

    def save_layers(self, image_id: str, layers: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return self.repository.save_layers(image_id, layers, int(time.time()))

    def update_current_image(
        self,
        image_id: str,
        filename: str,
        storage: str = "processed",
        operation: str | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self.repository.update_current_image(
            image_id, filename, storage, operation, int(time.time()), parameters
        )

    def history(self, image_id: str) -> dict[str, Any]:
        session = self._require(image_id)
        entries = session.get("history", [])
        index = session.get("history_index", 0)
        return {
            "image_id": image_id,
            "index": index,
            "total": len(entries),
            "entries": [
                {"index": i, "operation": entry["operation"], "time": entry["time"], "parameters": entry.get("parameters", {}), "current": i == index}
                for i, entry in enumerate(entries)
            ],
        }

    def goto(self, image_id: str, index: int) -> dict[str, Any]:
        session = self._require(image_id)
        if not isinstance(index, int) or not 0 <= index < len(session.get("history", [])):
            raise ValueError("History index is out of range.")
        return self.repository.set_current_history(image_id, index, int(time.time()))

    def undo(self, image_id: str) -> dict[str, Any]:
        session = self._require(image_id)
        index = session.get("history_index", 0)
        if index <= 0:
            raise ValueError("Nothing to undo.")
        return self.goto(image_id, index - 1)

    def redo(self, image_id: str) -> dict[str, Any]:
        session = self._require(image_id)
        index = session.get("history_index", 0)
        if index >= len(session.get("history", [])) - 1:
            raise ValueError("Nothing to redo.")
        return self.goto(image_id, index + 1)

    def clear_history(self, image_id: str) -> dict[str, Any]:
        self._require(image_id)
        return self.repository.clear_history(image_id, int(time.time()))

    def _require(self, image_id: str) -> dict[str, Any]:
        session = self.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        return session
