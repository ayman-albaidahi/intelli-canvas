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

    def crop(
        self,
        image_id: str,
        x: int,
        y: int,
        width: int,
        height: int,
    ) -> dict[str, Any]:
        if min(x, y, width, height) < 0 or width <= 0 or height <= 0:
            raise ValueError(
                "Crop coordinates and dimensions must be positive."
            )

        image, session, output_path = self._prepare_transform(image_id)
        try:
            right = x + width
            bottom = y + height
            if right > image.width or bottom > image.height:
                raise ValueError("Crop region must remain inside the image.")

            cropped = image.crop((x, y, right, bottom))
            try:
                image_format = image.format or output_path.suffix.lstrip(
                    "."
                ).upper()
                if image_format == "JPEG" and cropped.mode not in {"RGB", "L"}:
                    cropped = cropped.convert("RGB")
                cropped.save(output_path, format=image_format)
                dimensions = cropped.size
            finally:
                cropped.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        finally:
            image.close()

        return self._transform_metadata(
            image_id, session, output_path, dimensions
        )

    def rotate(self, image_id: str, angle: int) -> dict[str, Any]:
        if angle not in {90, -90, 180}:
            raise ValueError("Rotation angle must be 90, -90, or 180 degrees.")

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

        return self._transform_metadata(
            image_id, session, output_path, dimensions
        )

    def flip(self, image_id: str, direction: str) -> dict[str, Any]:
        if direction not in {"horizontal", "vertical"}:
            raise ValueError("Flip direction must be horizontal or vertical.")

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

        return self._transform_metadata(
            image_id, session, output_path, dimensions
        )

    def _prepare_transform(
        self, image_id: str
    ) -> tuple[Image.Image, dict[str, Any], Path]:
        session = self.session_service.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")

        stored_filename = session.get("stored_filename")
        if not isinstance(stored_filename, str) or not stored_filename:
            raise FileValidationError(
                "Image session has no valid stored file."
            )

        uploads_dir = self.storage_service.uploads_dir.resolve()
        input_path = (uploads_dir / stored_filename).resolve()
        try:
            input_path.relative_to(uploads_dir)
        except ValueError as exc:
            raise FileValidationError(
                "Image path escapes the uploads directory."
            ) from exc
        if not input_path.is_file():
            raise FileNotFoundError("Stored image was not found.")

        image = Image.open(input_path)
        output_name = self.storage_service.generate_safe_filename(
            input_path.name, directory=self.storage_service.processed_dir
        )
        output_path = self.storage_service.processed_dir / output_name
        return image, session, output_path

    def _transform_metadata(
        self,
        image_id: str,
        session: dict[str, Any],
        output_path: Path,
        dimensions: tuple[int, int],
    ) -> dict[str, Any]:
        return {
            "image_id": image_id,
            "width": dimensions[0],
            "height": dimensions[1],
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
