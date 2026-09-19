from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

from ..domain.results import OperationResult
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

        input_path = self._resolve_current_path(session)
        output_width, output_height = self._calculate_dimensions(
            image_path=input_path,
            width=width,
            height=height,
            lock_aspect_ratio=lock_aspect_ratio,
        )

        output_name = self.storage_service.generate_safe_filename(
            self._output_base_name(session, input_path),
            directory=self.storage_service.processed_dir,
        )
        label_Resize = f"Resize {output_width}x{output_height}"
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

        self.session_service.update_current_image(
            image_id, output_path.name, storage="processed",
            operation=label_Resize,
        )
        return OperationResult(
            image_id=image_id,
            width=output_width,
            height=output_height,
            format=output_path.suffix.lower().lstrip("."),
            mime_type=self._mime_type(output_path),
            path=output_path,
        )

    def rotate(self, image_id: str, angle: int) -> dict[str, Any]:
        if angle not in {90, -90, 180}:
            raise ValueError("Rotation angle must be 90, -90, or 180 degrees.")

        label_Rotate = f"Rotate {angle}"
        image, session, output_path = self._prepare_transform(image_id)
        try:
            transpose = {
                90: Image.Transpose.ROTATE_270,
                -90: Image.Transpose.ROTATE_90,
                180: Image.Transpose.ROTATE_180,
            }[angle]
            transformed = image.transpose(transpose)
            dimensions = transformed.size
            try:
                transformed.save(output_path, format=image.format)
            finally:
                transformed.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        finally:
            image.close()

        self.session_service.update_current_image(
            image_id, output_path.name, storage="processed",
            operation=label_Rotate,
        )
        return self._transform_metadata(image_id, output_path, dimensions)

    def flip(self, image_id: str, direction: str) -> dict[str, Any]:
        if direction not in {"horizontal", "vertical"}:
            raise ValueError("Flip direction must be horizontal or vertical.")

        label_Flip = f"Flip {direction}"
        image, session, output_path = self._prepare_transform(image_id)
        try:
            transpose = (
                Image.Transpose.FLIP_LEFT_RIGHT
                if direction == "horizontal"
                else Image.Transpose.FLIP_TOP_BOTTOM
            )
            transformed = image.transpose(transpose)
            dimensions = transformed.size
            try:
                transformed.save(output_path, format=image.format)
            finally:
                transformed.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        finally:
            image.close()

        self.session_service.update_current_image(
            image_id, output_path.name, storage="processed",
            operation=label_Flip,
        )
        return self._transform_metadata(image_id, output_path, dimensions)

    def crop(
        self, image_id: str, x: int, y: int, width: int, height: int
    ) -> dict[str, Any]:
        if x < 0 or y < 0 or width <= 0 or height <= 0:
            raise ValueError("Crop dimensions must be positive and coordinates non-negative.")

        label = f"Crop {width}x{height} at {x},{y}"
        image, session, output_path = self._prepare_transform(image_id)
        try:
            if x + width > image.width or y + height > image.height:
                raise ValueError("Crop rectangle exceeds image bounds.")
            transformed = image.crop((x, y, x + width, y + height))
            dimensions = transformed.size
            try:
                transformed.save(output_path, format=image.format)
            finally:
                transformed.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        finally:
            image.close()

        self.session_service.update_current_image(
            image_id, output_path.name, storage="processed", operation=label
        )
        return self._transform_metadata(image_id, output_path, dimensions)

    def _resolve_current_path(self, session: dict[str, Any]) -> Path:
        stored_filename = session.get("current_filename") or session.get(
            "stored_filename"
        )
        if not isinstance(stored_filename, str) or not stored_filename:
            raise FileValidationError("Image session has no valid stored file.")

        source_dir = (
            self.storage_service.processed_dir
            if session.get("current_storage") == "processed"
            else self.storage_service.uploads_dir
        ).resolve()
        input_path = (source_dir / stored_filename).resolve()
        try:
            input_path.relative_to(source_dir)
        except ValueError as exc:
            raise FileValidationError(
                "Image path escapes the storage directory."
            ) from exc
        if not input_path.is_file():
            raise FileNotFoundError("Stored image was not found.")
        return input_path

    def _prepare_transform(
        self, image_id: str
    ) -> tuple[Image.Image, dict[str, Any], Path]:
        session = self.session_service.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")

        input_path = self._resolve_current_path(session)
        image = Image.open(input_path)
        output_name = self.storage_service.generate_safe_filename(
            self._output_base_name(session, input_path),
            directory=self.storage_service.processed_dir,
        )
        output_path = self.storage_service.processed_dir / output_name
        return image, session, output_path

    def _output_base_name(self, session: dict[str, Any], input_path: Path) -> str:
        """Derive output names from the original upload stem, not the
        current filename, so chained operations cannot grow file paths."""
        base_stem = session.get("base_stem")
        if not isinstance(base_stem, str) or not base_stem:
            base_stem = input_path.stem
        extension = input_path.suffix.lower() or ".png"
        return f"{base_stem}{extension}"

    def _transform_metadata(
        self,
        image_id: str,
        output_path: Path,
        dimensions: tuple[int, int],
    ) -> OperationResult:
        return OperationResult(
            image_id=image_id,
            width=dimensions[0],
            height=dimensions[1],
            format=output_path.suffix.lower().lstrip("."),
            mime_type=self._mime_type(output_path),
            path=output_path,
        )

    def _mime_type(self, output_path: Path) -> str:
        return {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
        }.get(output_path.suffix.lower(), "application/octet-stream")

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
