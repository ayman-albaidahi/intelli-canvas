from __future__ import annotations

import uuid
from typing import Any


class ImageSessionService:
    """In-memory session registry for uploaded images."""

    def __init__(self, session_store: dict[str, dict[str, Any]] | None = None):
        self.session_store = session_store if session_store is not None else {}

    def create_session(self, metadata: dict[str, Any]) -> dict[str, Any]:
        image_id = uuid.uuid4().hex
        while image_id in self.session_store:
            image_id = uuid.uuid4().hex

        payload = {"image_id": image_id, **metadata}
        self.session_store[image_id] = payload
        return payload

    def list_sessions(self) -> list[dict[str, Any]]:
        return list(self.session_store.values())

    def get_session(self, image_id: str) -> dict[str, Any] | None:
        return self.session_store.get(image_id)
