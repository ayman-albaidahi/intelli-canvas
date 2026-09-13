from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any

from werkzeug.utils import secure_filename

MAX_BASE_STEM_LENGTH = 60


class ImageSessionService:
    """In-memory session registry for uploaded images."""

    def __init__(self, session_store: dict[str, dict[str, Any]] | None = None):
        self.session_store = session_store if session_store is not None else {}

    def create_session(self, metadata: dict[str, Any]) -> dict[str, Any]:
        image_id = uuid.uuid4().hex
        while image_id in self.session_store:
            image_id = uuid.uuid4().hex

        payload = {
            "image_id": image_id,
            **metadata,
            "base_stem": self._base_stem(metadata.get("original_filename")),
            "current_filename": metadata.get("stored_filename"),
            "current_storage": "uploads",
            "history": [{
                "operation": "Upload",
                "filename": metadata.get("stored_filename"),
                "time": int(time.time()),
            }],
            "history_index": 0,
        }
        self.session_store[image_id] = payload
        return payload

    def _base_stem(self, original_filename: Any) -> str:
        """Stem of the original upload; processed outputs derive from it.

        Keeping the stem fixed bounds every generated filename so chained
        operations cannot grow paths past filesystem limits.
        """
        stem = Path(str(original_filename or "")).stem
        sanitized = secure_filename(stem)
        if not sanitized:
            sanitized = "image"
        return sanitized[:MAX_BASE_STEM_LENGTH]

    def list_sessions(self) -> list[dict[str, Any]]:
        return list(self.session_store.values())

    def get_session(self, image_id: str) -> dict[str, Any] | None:
        return self.session_store.get(image_id)

    def update_current_image(
        self,
        image_id: str,
        filename: str,
        storage: str = "processed",
        operation: str | None = None,
    ) -> dict[str, Any]:
        session = self.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        session["current_filename"] = filename
        session["current_storage"] = storage
        if operation:
            history: list[dict[str, Any]] = session.setdefault("history", [])
            index = session.get("history_index", len(history) - 1)
            del history[index + 1:]
            history.append({
                "operation": operation,
                "filename": filename,
                "time": int(time.time()),
            })
            session["history_index"] = len(history) - 1
        return session

    def history(self, image_id: str) -> dict[str, Any]:
        session = self.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        history: list[dict[str, Any]] = session.get("history", [])
        index = min(session.get("history_index", 0), len(history) - 1)
        return {
            "image_id": image_id,
            "index": index,
            "total": len(history),
            "entries": [
                {
                    "index": i,
                    "operation": entry["operation"],
                    "time": entry["time"],
                    "current": i == index,
                }
                for i, entry in enumerate(history)
            ],
        }

    def goto(self, image_id: str, index: int) -> dict[str, Any]:
        session = self.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        history: list[dict[str, Any]] = session.get("history", [])
        if not isinstance(index, int) or not 0 <= index < len(history):
            raise ValueError("History index is out of range.")
        session["current_filename"] = history[index]["filename"]
        session["current_storage"] = "processed" if index > 0 else "uploads"
        session["history_index"] = index
        return session

    def undo(self, image_id: str) -> dict[str, Any]:
        session = self.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        index = session.get("history_index", 0)
        if index <= 0:
            raise ValueError("Nothing to undo.")
        return self.goto(image_id, index - 1)

    def redo(self, image_id: str) -> dict[str, Any]:
        session = self.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        index = session.get("history_index", 0)
        if index >= len(session.get("history", [])) - 1:
            raise ValueError("Nothing to redo.")
        return self.goto(image_id, index + 1)

    def clear_history(self, image_id: str) -> dict[str, Any]:
        session = self.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        current = session["current_filename"]
        session["history"] = [{
            "operation": "Current state",
            "filename": current,
            "time": int(time.time()),
        }]
        session["history_index"] = 0
        return session
