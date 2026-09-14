from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

from .file_service import FileStorageService
from .image_io_service import ImageIOService
from .image_session_service import ImageSessionService
from .process_operations import (
    apply_blur,
    apply_brightness,
    apply_chain,
    apply_contrast,
    apply_grayscale,
    apply_negative,
    apply_saturation,
    apply_sharpen,
)


class ProcessService:
    """Applies deterministic pixel operations to the current session image."""

    def __init__(self, session_service: ImageSessionService, storage_service: FileStorageService | None = None):
        self.session_service = session_service
        self.storage_service = storage_service or FileStorageService()
        self.image_io = ImageIOService(session_service, self.storage_service)

    def negative(self, image_id: str) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, "negative", ".png")
        try:
            with Image.open(source_path) as source:
                result = apply_negative(source)
                try:
                    result.save(output_path, format="PNG")
                finally:
                    result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise

        with Image.open(output_path) as image:
            width, height = image.size
        self.session_service.update_current_image(image_id, output_path.name, "processed", operation="Negative")
        return {
            "image_id": image_id,
            "format": "png",
            "mime_type": "image/png",
            "filename": output_path.name,
            "path": output_path,
            "width": width,
            "height": height,
            "operation": "negative",
        }

    def adjustments(self, image_id: str, values: dict[str, Any]) -> dict[str, Any]:
        """Apply every requested adjustment in one pass, writing one file."""
        if not values:
            raise ValueError("No adjustments were requested.")
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, "adjustments", ".png")
        try:
            with Image.open(source_path) as source:
                result = apply_chain(source, values)
                try:
                    result.save(output_path, format="PNG")
                finally:
                    result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise

        with Image.open(output_path) as image:
            width, height = image.size
        self.session_service.update_current_image(image_id, output_path.name, "processed", operation="Adjustments")
        return {
            "image_id": image_id,
            "format": "png",
            "mime_type": "image/png",
            "filename": output_path.name,
            "path": output_path,
            "width": width,
            "height": height,
            "operation": "adjustments",
            "values": {key: value for key, value in values.items()},
        }

    def grayscale(self, image_id: str) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, "grayscale", ".png")
        try:
            with Image.open(source_path) as source:
                result = apply_grayscale(source)
                try:
                    result.save(output_path, format="PNG")
                finally:
                    result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise

        with Image.open(output_path) as image:
            width, height = image.size
        self.session_service.update_current_image(image_id, output_path.name, "processed", operation="Grayscale")
        return {
            "image_id": image_id,
            "format": "png",
            "mime_type": "image/png",
            "filename": output_path.name,
            "path": output_path,
            "width": width,
            "height": height,
            "operation": "grayscale",
        }

    def brightness(self, image_id: str, value: int) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, "brightness", ".png")
        try:
            with Image.open(source_path) as source:
                result = apply_brightness(source, value)
                try:
                    result.save(output_path, format="PNG")
                finally:
                    result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise

        with Image.open(output_path) as image:
            width, height = image.size
        self.session_service.update_current_image(image_id, output_path.name, "processed", operation=f"Brightness {value}%")
        return {
            "image_id": image_id,
            "format": "png",
            "mime_type": "image/png",
            "filename": output_path.name,
            "path": output_path,
            "width": width,
            "height": height,
            "operation": "brightness",
            "value": value,
        }

    def contrast(self, image_id: str, value: int) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, "contrast", ".png")
        try:
            with Image.open(source_path) as source:
                result = apply_contrast(source, value)
                try:
                    result.save(output_path, format="PNG")
                finally:
                    result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise

        with Image.open(output_path) as image:
            width, height = image.size
        self.session_service.update_current_image(image_id, output_path.name, "processed", operation=f"Contrast {value}%")
        return {
            "image_id": image_id,
            "format": "png",
            "mime_type": "image/png",
            "filename": output_path.name,
            "path": output_path,
            "width": width,
            "height": height,
            "operation": "contrast",
            "value": value,
        }

    def blur(self, image_id: str, value: int) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, "blur", ".png")
        try:
            with Image.open(source_path) as source:
                result = apply_blur(source, value)
                try:
                    result.save(output_path, format="PNG")
                finally:
                    result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise

        with Image.open(output_path) as image:
            width, height = image.size
        self.session_service.update_current_image(image_id, output_path.name, "processed", operation=f"Blur {value}px")
        return {
            "image_id": image_id,
            "format": "png",
            "mime_type": "image/png",
            "filename": output_path.name,
            "path": output_path,
            "width": width,
            "height": height,
            "operation": "blur",
            "value": value,
        }

    def sharpen(self, image_id: str, value: int) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, "sharpen", ".png")
        try:
            with Image.open(source_path) as source:
                result = apply_sharpen(source, value)
                try:
                    result.save(output_path, format="PNG")
                finally:
                    result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise

        with Image.open(output_path) as image:
            width, height = image.size
        self.session_service.update_current_image(image_id, output_path.name, "processed", operation=f"Sharpen {value}")
        return {
            "image_id": image_id,
            "format": "png",
            "mime_type": "image/png",
            "filename": output_path.name,
            "path": output_path,
            "width": width,
            "height": height,
            "operation": "sharpen",
            "value": value,
        }

    def saturation(self, image_id: str, value: int) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, "saturation", ".png")
        try:
            with Image.open(source_path) as source:
                result = apply_saturation(source, value)
                try:
                    result.save(output_path, format="PNG")
                finally:
                    result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise

        with Image.open(output_path) as image:
            width, height = image.size
        self.session_service.update_current_image(image_id, output_path.name, "processed", operation=f"Saturation {value}%")
        return {
            "image_id": image_id,
            "format": "png",
            "mime_type": "image/png",
            "filename": output_path.name,
            "path": output_path,
            "width": width,
            "height": height,
            "operation": "saturation",
            "value": value,
        }

    def _new_output_path(self, image_id: str, operation: str, extension: str) -> Path:
        """Derive the output name from the session's original upload stem.

        Chaining the current file's stem grows the filename by a uuid on
        every operation and eventually exceeds the Windows path limit.
        """
        session = self.session_service.get_session(image_id)
        base_stem = session.get("base_stem") if session else None
        if not isinstance(base_stem, str) or not base_stem:
            base_stem = "image"
        filename = self.storage_service.generate_safe_filename(f"{base_stem}_{operation}{extension}", directory=self.storage_service.processed_dir)
        return self.storage_service.processed_dir / filename
