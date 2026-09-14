from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

from .file_service import FileStorageService, FileValidationError
from .image_session_service import ImageSessionService

SUPPORTED_EXPORT_FORMATS = {
    "png": ("PNG", ".png", "image/png"),
    "jpeg": ("JPEG", ".jpg", "image/jpeg"),
    "jpg": ("JPEG", ".jpg", "image/jpeg"),
    "webp": ("WEBP", ".webp", "image/webp"),
}


class ImageIOService:
    """Converts session images and stores export results safely."""

    def __init__(
        self,
        session_service: ImageSessionService,
        storage_service: FileStorageService | None = None,
    ):
        self.session_service = session_service
        self.storage_service = storage_service or FileStorageService()

    def convert(
        self,
        image_id: str,
        target_format: str,
        *,
        quality: int | None = None,
        width: int | None = None,
        height: int | None = None,
        source_path: Path | None = None,
    ) -> dict[str, Any]:
        export_format = SUPPORTED_EXPORT_FORMATS.get(target_format.lower())
        if export_format is None:
            raise ValueError("Unsupported export format.")

        resolved_source, session = self._resolve_source(image_id)
        source_path = source_path or resolved_source
        pillow_format, extension, mime_type = export_format
        base_stem = session.get("base_stem")
        if not isinstance(base_stem, str) or not base_stem:
            base_stem = source_path.stem
        output_name = self.storage_service.generate_safe_filename(
            f"{base_stem}{extension}",
            directory=self.storage_service.processed_dir,
        )
        output_path = self.storage_service.processed_dir / output_name

        try:
            with Image.open(source_path) as source:
                if pillow_format == "JPEG":
                    if source.mode in ("RGBA", "LA", "P"):
                        flattened = Image.new("RGB", source.size, (255, 255, 255))
                        flattened.paste(source.convert("RGBA"), (0, 0), source.convert("RGBA").split()[-1])
                        image = flattened
                    else:
                        image = source.convert("RGB")
                else:
                    image = source.copy()
                if width or height:
                    if width and height:
                        target = (width, height)
                    elif width:
                        target = (width, max(1, round(image.height * width / image.width)))
                    else:
                        target = (max(1, round(image.width * height / image.height)), height)
                    image = image.resize(target, Image.Resampling.LANCZOS)
                try:
                    save_kwargs: dict[str, Any] = {}
                    if pillow_format in ("JPEG", "WEBP") and quality is not None:
                        save_kwargs["quality"] = quality
                    image.save(output_path, format=pillow_format, **save_kwargs)
                finally:
                    image.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise

        with Image.open(output_path) as result:
            width, height = result.size

        return {
            "image_id": image_id,
            "format": (
                "jpeg" if pillow_format == "JPEG" else target_format.lower()
            ),
            "mime_type": mime_type,
            "path": output_path,
            "filename": output_path.name,
            "width": width,
            "height": height,
        }

    def _resolve_source(self, image_id: str) -> tuple[Path, dict[str, Any]]:
        session = self.session_service.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")

        stored_filename = session.get("current_filename") or session.get(
            "stored_filename"
        )
        if not isinstance(stored_filename, str) or not stored_filename:
            raise FileValidationError(
                "Image session has no valid stored file."
            )

        source_dir = (
            self.storage_service.processed_dir
            if session.get("current_storage") == "processed"
            else self.storage_service.uploads_dir
        ).resolve()
        source_path = (source_dir / stored_filename).resolve()
        try:
            source_path.relative_to(source_dir)
        except ValueError as exc:
            raise FileValidationError(
                "Image path escapes the uploads directory."
            ) from exc
        if not source_path.is_file():
            raise FileNotFoundError("Stored image was not found.")
        return source_path, session
