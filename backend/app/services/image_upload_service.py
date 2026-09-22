from __future__ import annotations

from typing import Any, BinaryIO

from .file_service import FileStorageService
from .image_session_service import ImageSessionService


class ImageUploadService:
    """Validates, stores, and registers an uploaded image."""

    def __init__(
        self,
        session_service: ImageSessionService,
        storage_service: FileStorageService,
    ):
        self.session_service = session_service
        self.storage_service = storage_service

    def upload(
        self,
        uploaded_file: BinaryIO,
        filename: str,
        owner_id: str | None = None,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        self.storage_service.validate_file(uploaded_file, filename)
        saved_path = self.storage_service.save_file(uploaded_file, filename)

        image_metadata = {
            "original_filename": filename,
            "stored_filename": saved_path.name,
            "format": saved_path.suffix.lower().lstrip("."),
            "mime_type": self.storage_service.detect_mime_type(uploaded_file, filename),
            "size": saved_path.stat().st_size,
        }

        try:
            session_data = self.session_service.create_session(
                image_metadata, owner_id=owner_id, project_id=project_id
            )
        except (OSError, TypeError, ValueError, KeyError):
            if saved_path.exists():
                saved_path.unlink()
            raise

        return {
            "image_id": session_data["image_id"],
            "original_filename": session_data["original_filename"],
            "format": session_data["format"],
            "mime_type": session_data["mime_type"],
            "size": session_data["size"],
        }
