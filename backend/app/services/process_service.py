from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from PIL import Image

from ..domain.results import OperationResult
from .file_service import FileStorageService
from .image_io_service import ImageIOService
from .image_session_service import ImageSessionService
from .process_operations import (
    apply_blur,
    apply_brightness,
    apply_chain,
    apply_contrast,
    apply_gamma,
    apply_grayscale,
    apply_laplacian,
    apply_median_filter,
    apply_morphology,
    apply_negative,
    apply_saturation,
    apply_sharpen,
    apply_sobel,
    apply_threshold,
    compute_histogram,
)


class ProcessService:
    """Applies deterministic pixel operations to the current session image."""

    def __init__(
        self,
        session_service: ImageSessionService,
        storage_service: FileStorageService | None = None,
    ):
        self.session_service = session_service
        self.storage_service = storage_service or FileStorageService()
        self.image_io = ImageIOService(session_service, self.storage_service)

    def negative(self, image_id: str) -> dict[str, Any]:
        return self._transform(
            image_id,
            "negative",
            "Negative",
            apply_negative,
        )

    def adjustments(self, image_id: str, values: dict[str, Any]) -> dict[str, Any]:
        """Apply every requested adjustment in one pass, writing one file."""
        if not values:
            raise ValueError("No adjustments were requested.")
        return self._transform(
            image_id,
            "adjustments",
            "Adjustments",
            lambda source: apply_chain(source, values),
            values={key: value for key, value in values.items()},
        )

    def grayscale(self, image_id: str) -> dict[str, Any]:
        return self._transform(image_id, "grayscale", "Grayscale", apply_grayscale)

    def brightness(self, image_id: str, value: int) -> dict[str, Any]:
        return self._transform(
            image_id,
            "brightness",
            f"Brightness {value}%",
            lambda source: apply_brightness(source, value),
            value=value,
        )

    def contrast(self, image_id: str, value: int) -> dict[str, Any]:
        return self._transform(
            image_id,
            "contrast",
            f"Contrast {value}%",
            lambda source: apply_contrast(source, value),
            value=value,
        )

    def blur(self, image_id: str, value: int) -> dict[str, Any]:
        return self._transform(
            image_id,
            "blur",
            f"Blur {value}px",
            lambda source: apply_blur(source, value),
            value=value,
        )

    def sharpen(self, image_id: str, value: int) -> dict[str, Any]:
        return self._transform(
            image_id,
            "sharpen",
            f"Sharpen {value}",
            lambda source: apply_sharpen(source, value),
            value=value,
        )

    def saturation(self, image_id: str, value: int) -> dict[str, Any]:
        return self._transform(
            image_id,
            "saturation",
            f"Saturation {value}%",
            lambda source: apply_saturation(source, value),
            value=value,
        )

    def histogram(self, image_id: str) -> dict[str, list[int]]:
        """Read the current image without updating session or history state."""
        source_path, _ = self.image_io._resolve_source(image_id)
        with Image.open(source_path) as source:
            return compute_histogram(source)

    def sobel(self, image_id: str, ksize: int = 3) -> dict[str, Any]:
        return self._transform(
            image_id,
            "sobel",
            f"Sobel edges ({ksize})",
            lambda source: apply_sobel(source, ksize),
            ksize=ksize,
        )

    def laplacian(self, image_id: str) -> dict[str, Any]:
        return self._transform(
            image_id,
            "laplacian",
            "Laplacian edges",
            apply_laplacian,
        )

    def median_filter(self, image_id: str, ksize: int = 3) -> dict[str, Any]:
        return self._transform(
            image_id,
            "median-filter",
            f"Median filter ({ksize})",
            lambda source: apply_median_filter(source, ksize),
            ksize=ksize,
        )

    def morphology(
        self, image_id: str, operation: str, ksize: int = 3
    ) -> dict[str, Any]:
        return self._transform(
            image_id,
            "morphology",
            f"Morphology {operation} ({ksize})",
            lambda source: apply_morphology(source, operation, ksize),
            morphology_operation=operation,
            ksize=ksize,
        )

    def gamma(self, image_id: str, value: float) -> dict[str, Any]:
        return self._transform(
            image_id,
            "gamma",
            f"Gamma {value:g}",
            lambda source: apply_gamma(source, value),
            value=value,
        )

    def threshold(self, image_id: str, value: int) -> dict[str, Any]:
        return self._transform(
            image_id,
            "threshold",
            f"Threshold {value}",
            lambda source: apply_threshold(source, value),
            value=value,
        )

    def _transform(
        self,
        image_id: str,
        operation: str,
        history_label: str,
        transform: Callable[[Image.Image], Image.Image],
        **metadata: Any,
    ) -> dict[str, Any]:
        source_path, _ = self.image_io._resolve_source(image_id)
        output_path = self._new_output_path(image_id, operation, ".png")
        try:
            with Image.open(source_path) as source:
                result = transform(source)
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
        self.session_service.update_current_image(
            image_id, output_path.name, "processed", operation=history_label, parameters=metadata
        )
        return OperationResult(
            image_id=image_id,
            width=width,
            height=height,
            format="png",
            mime_type="image/png",
            path=output_path,
            filename=output_path.name,
            public_extras={"operation": operation, **metadata},
        )

    def _new_output_path(self, image_id: str, operation: str, extension: str) -> Path:
        """Derive the output name from the session's original upload stem.

        Chaining the current file's stem grows the filename by a uuid on every
        operation and eventually exceeds the Windows path limit.
        """
        session = self.session_service.get_session(image_id)
        base_stem = session.get("base_stem") if session else None
        if not isinstance(base_stem, str) or not base_stem:
            base_stem = "image"
        filename = self.storage_service.generate_safe_filename(
            f"{base_stem}_{operation}{extension}",
            directory=self.storage_service.processed_dir,
        )
        return self.storage_service.processed_dir / filename
