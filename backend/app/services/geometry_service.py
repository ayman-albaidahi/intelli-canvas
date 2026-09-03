from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

from .file_service import FileStorageService, FileValidationError
from .image_session_service import ImageSessionService


class GeometryService:
    """Performs geometry operations on images referenced by a session."""

    def __init__(
        self,
        session_service: ImageSessionService,
        storage_service: FileStorageService | None = None,
    ):
        self.session_service = session_service
        self.storage_service = storage_service or FileStorageService()

    def resize(
        self,
        image_id: str,
        width: int | None = None,
        height: int | None = None,
        lock_aspect_ratio: bool = True,
    ) -> dict[str, Any]:
        session = self.session_service.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")

        stored_filename = session.get("stored_filename")
        if not isinstance(stored_filename, str) or not stored_filename:
            raise FileValidationError(
                "Image session has no valid stored file."
            )

        uploads_dir = self.storage_service.uploads_dir
        input_path = (uploads_dir / stored_filename).resolve()
        try:
            input_path.relative_to(uploads_dir.resolve())
        except ValueError as exc:
            raise FileValidationError(
                "Image path escapes the uploads directory."
            ) from exc

        if not input_path.is_file():
            raise FileNotFoundError("Stored image was not found.")

        output_width, output_height = self._calculate_dimensions(
            image_path=input_path,
            width=width,
            height=height,
            lock_aspect_ratio=lock_aspect_ratio,
        )

        output_name = self.storage_service.generate_safe_filename(
            input_path.name,
            directory=self.storage_service.processed_dir,
        )
        output_path = self.storage_service.processed_dir / output_name

        try:
            with Image.open(input_path) as source:
                image_format = source.format or input_path.suffix.lstrip(
                    "."
                ).upper()
                resized = source.resize(
                    (output_width, output_height), Image.Resampling.LANCZOS
                )
                try:
                    resized.save(output_path, format=image_format)
                finally:
                    resized.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise

        return {
            "image_id": image_id,
            "width": output_width,
            "height": output_height,
            "format": output_path.suffix.lower().lstrip("."),
            "mime_type": session.get("mime_type", "application/octet-stream"),
        }

    def _calculate_dimensions(
        self,
        image_path: Path,
        width: int | None,
        height: int | None,
        lock_aspect_ratio: bool,
    ) -> tuple[int, int]:
        with Image.open(image_path) as source:
            original_width, original_height = source.size

        if not lock_aspect_ratio:
            if width is None or height is None:
                raise ValueError(
                    "Both dimensions are required when ratio is unlocked."
                )
            return width, height

        if width is None and height is not None:
            width = round(original_width * height / original_height)
        elif height is None and width is not None:
            height = round(original_height * width / original_width)
        assert width is not None and height is not None
        scale = min(width / original_width, height / original_height)
        width = round(original_width * scale)
        height = round(original_height * scale)

        return max(1, width), max(1, height)