from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from .file_service import FileStorageService, FileValidationError
from .image_io_service import ImageIOService
from .image_session_service import ImageSessionService


class ProcessService:
    """Applies deterministic pixel operations to the current session image."""

    def __init__(self, session_service: ImageSessionService, storage_service: FileStorageService | None = None):
        self.session_service = session_service
        self.storage_service = storage_service or FileStorageService()
        self.image_io = ImageIOService(session_service, self.storage_service)

    def grayscale(self, image_id: str) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(source_path, "grayscale", ".png")
        try:
            with Image.open(source_path) as source:
                result = ImageOps.grayscale(source).convert("RGB")
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
        self.session_service.update_current_image(image_id, output_path.name, "processed")
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
        output_path = self._new_output_path(source_path, "brightness", ".png")
        factor = value / 100
        try:
            with Image.open(source_path) as source:
                result = ImageEnhance.Brightness(source).enhance(factor)
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
        self.session_service.update_current_image(image_id, output_path.name, "processed")
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
        output_path = self._new_output_path(source_path, "contrast", ".png")
        factor = value / 100
        try:
            with Image.open(source_path) as source:
                result = ImageEnhance.Contrast(source).enhance(factor)
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
        self.session_service.update_current_image(image_id, output_path.name, "processed")
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
        output_path = self._new_output_path(source_path, "blur", ".png")
        try:
            with Image.open(source_path) as source:
                result = source.filter(ImageFilter.GaussianBlur(radius=value))
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
        self.session_service.update_current_image(image_id, output_path.name, "processed")
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
        output_path = self._new_output_path(source_path, "sharpen", ".png")
        factor = 1 + (value / 5)
        try:
            with Image.open(source_path) as source:
                result = ImageEnhance.Sharpness(source).enhance(factor)
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
        self.session_service.update_current_image(image_id, output_path.name, "processed")
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
        output_path = self._new_output_path(source_path, "saturation", ".png")
        factor = value / 100
        try:
            with Image.open(source_path) as source:
                result = ImageEnhance.Color(source).enhance(factor)
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
        self.session_service.update_current_image(image_id, output_path.name, "processed")
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

    def _new_output_path(self, source_path: Path, operation: str, extension: str) -> Path:
        filename = self.storage_service.generate_safe_filename(f"{source_path.stem}_{operation}{extension}", directory=self.storage_service.processed_dir)
        return self.storage_service.processed_dir / filename
