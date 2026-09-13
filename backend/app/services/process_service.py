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

    def negative(self, image_id: str) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, "negative", ".png")
        try:
            with Image.open(source_path) as source:
                result = ImageOps.invert(source.convert("RGB"))
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
                result = self._apply_chain(source, values)
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
            "operation": "adjustments",
            "values": {key: value for key, value in values.items()},
        }

    def _apply_chain(self, image: Image.Image, values: dict[str, Any]) -> Image.Image:
        result = image
        if values.get("brightness", 100) != 100:
            result = ImageEnhance.Brightness(result).enhance(values["brightness"] / 100)
        if values.get("contrast", 100) != 100:
            result = ImageEnhance.Contrast(result).enhance(values["contrast"] / 100)
        if values.get("saturation", 100) != 100:
            result = ImageEnhance.Color(result).enhance(values["saturation"] / 100)
        if values.get("grayscale", False):
            result = ImageOps.grayscale(result).convert("RGB")
        if values.get("blur", 0) > 0:
            result = result.filter(ImageFilter.GaussianBlur(values["blur"]))
        if values.get("sharpen", 0) != 0:
            result = ImageEnhance.Sharpness(result).enhance(1 + (values["sharpen"] / 5))
        if values.get("negative", False):
            result = ImageOps.invert(result.convert("RGB"))
        return result

    def grayscale(self, image_id: str) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, "grayscale", ".png")
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
        output_path = self._new_output_path(image_id, "brightness", ".png")
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
        output_path = self._new_output_path(image_id, "contrast", ".png")
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
        output_path = self._new_output_path(image_id, "blur", ".png")
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
        output_path = self._new_output_path(image_id, "sharpen", ".png")
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
        output_path = self._new_output_path(image_id, "saturation", ".png")
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
