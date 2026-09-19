"""Deterministic saliency-based crop proposals and application."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

from ..domain.results import OperationResult
from .file_service import FileStorageService, FileValidationError
from .image_session_service import ImageSessionService

ASPECT_RATIOS: dict[str, tuple[int, int] | None] = {
    "original": None,
    "free": None,
    "1:1": (1, 1),
    "4:5": (4, 5),
    "5:4": (5, 4),
    "16:9": (16, 9),
    "9:16": (9, 16),
    "3:2": (3, 2),
    "2:3": (2, 3),
}


class SmartCropError(ValueError):
    """Raised when Smart Crop parameters cannot be used."""


class SmartCropService:
    """Propose and apply a crop using a bounded saliency search.

    Saliency is estimated from normalized edge energy, local contrast, and
    color saturation. The search runs on a small analysis copy, then maps the
    best rectangle back to source pixels. This is deterministic and does not
    mutate the session during preview.
    """

    def __init__(
        self,
        session_service: ImageSessionService,
        storage_service: FileStorageService,
    ) -> None:
        self.session_service = session_service
        self.storage_service = storage_service

    def propose(self, image_id: str, aspect_ratio: str = "original") -> dict[str, Any]:
        source_path, source = self._source(image_id)
        try:
            ratio = self.parse_aspect_ratio(aspect_ratio)
            box, score = self._find_box(source, ratio)
            return {
                "image_id": image_id,
                "aspect_ratio": aspect_ratio,
                "x": box[0],
                "y": box[1],
                "width": box[2],
                "height": box[3],
                "score": round(score, 6),
                "source_width": source.width,
                "source_height": source.height,
                "source_filename": source_path.name,
            }
        finally:
            source.close()

    def preview(
        self, image_id: str, aspect_ratio: str = "original"
    ) -> tuple[Path, dict[str, Any]]:
        proposal = self.propose(image_id, aspect_ratio)
        source_path, source = self._source(image_id)
        output_name = self.storage_service.generate_safe_filename(
            f"smart-crop-preview-{image_id}.png",
            directory=self.storage_service.processed_dir,
        )
        output_path = self.storage_service.processed_dir / output_name
        try:
            cropped = source.crop(self._box_tuple(proposal))
            try:
                cropped.save(output_path, format="PNG", optimize=True)
            finally:
                cropped.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        finally:
            source.close()
        return output_path, proposal

    def apply(self, image_id: str, aspect_ratio: str = "original") -> dict[str, Any]:
        proposal = self.propose(image_id, aspect_ratio)
        source_path, source = self._source(image_id)
        output_name = self.storage_service.generate_safe_filename(
            f"smart-crop-{image_id}.png",
            directory=self.storage_service.processed_dir,
        )
        output_path = self.storage_service.processed_dir / output_name
        try:
            cropped = source.crop(self._box_tuple(proposal))
            try:
                cropped.save(output_path, format="PNG", optimize=True)
            finally:
                cropped.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        finally:
            source.close()

        self.session_service.update_current_image(
            image_id,
            output_path.name,
            "processed",
            operation=f"Smart crop {proposal['width']}x{proposal['height']}",
            parameters={
                "aspect_ratio": aspect_ratio,
                "x": proposal["x"],
                "y": proposal["y"],
                "width": proposal["width"],
                "height": proposal["height"],
                "saliency_score": proposal["score"],
            },
        )
        return OperationResult(
            image_id=image_id,
            width=proposal["width"],
            height=proposal["height"],
            format="png",
            mime_type="image/png",
            path=output_path,
            public_extras={
                **{k: v for k, v in proposal.items() if k not in ("width", "height")},
                "filename": output_path.name,
            },
        )

    @staticmethod
    def parse_aspect_ratio(value: str) -> tuple[float, float] | None:
        if not isinstance(value, str) or not value.strip():
            raise SmartCropError("aspect_ratio must be a supported ratio string.")
        normalized = value.strip().lower()
        if normalized in ASPECT_RATIOS:
            ratio = ASPECT_RATIOS[normalized]
            return None if ratio is None else (float(ratio[0]), float(ratio[1]))
        parts = normalized.split(":")
        if len(parts) != 2:
            raise SmartCropError("aspect_ratio must use the W:H format.")
        try:
            width, height = (float(part) for part in parts)
        except ValueError as exc:
            raise SmartCropError("aspect_ratio must use numeric W:H values.") from exc
        if (
            not math.isfinite(width)
            or not math.isfinite(height)
            or width <= 0
            or height <= 0
        ):
            raise SmartCropError("aspect_ratio values must be positive finite numbers.")
        if width > 1000 or height > 1000:
            raise SmartCropError("aspect_ratio values are too large.")
        return width, height

    def _source(self, image_id: str) -> tuple[Path, Image.Image]:
        session = self.session_service.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        stored = session.get("current_filename") or session.get("stored_filename")
        if not isinstance(stored, str) or not stored:
            raise FileValidationError("Image session has no valid stored file.")
        directory = (
            self.storage_service.processed_dir
            if session.get("current_storage") == "processed"
            else self.storage_service.uploads_dir
        ).resolve()
        path = (directory / stored).resolve()
        try:
            path.relative_to(directory)
        except ValueError as exc:
            raise FileValidationError(
                "Image path escapes the storage directory."
            ) from exc
        if not path.is_file():
            raise FileNotFoundError("Stored image was not found.")
        return path, Image.open(path).convert("RGB")

    @staticmethod
    def _box_tuple(proposal: dict[str, Any]) -> tuple[int, int, int, int]:
        x, y = int(proposal["x"]), int(proposal["y"])
        return x, y, x + int(proposal["width"]), y + int(proposal["height"])

    @staticmethod
    def _find_box(
        image: Image.Image, ratio: tuple[float, float] | None
    ) -> tuple[tuple[int, int, int, int], float]:
        width, height = image.size
        if ratio is None:
            return (0, 0, width, height), 1.0

        target = ratio[0] / ratio[1]
        if width / height > target:
            crop_width, crop_height = max(1, round(height * target)), height
        else:
            crop_width, crop_height = width, max(1, round(width / target))
        if crop_width == width and crop_height == height:
            return (0, 0, width, height), 1.0

        max_side = 512
        scale = min(1.0, max_side / max(width, height))
        small_width = max(8, round(width * scale))
        small_height = max(8, round(height * scale))
        small = np.asarray(
            image.resize((small_width, small_height), Image.Resampling.BILINEAR)
        )
        gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        edges = cv2.magnitude(gx, gy)
        edges = cv2.normalize(edges, None, 0, 1, cv2.NORM_MINMAX)
        hsv = cv2.cvtColor(small, cv2.COLOR_RGB2HSV)
        saturation = hsv[:, :, 1].astype(np.float32) / 255.0
        saliency = cv2.GaussianBlur(0.65 * edges + 0.35 * saturation, (0, 0), 3)
        integral = cv2.integral(saliency, sdepth=cv2.CV_64F)
        small_crop_width = max(1, round(crop_width * small_width / width))
        small_crop_height = max(1, round(crop_height * small_height / height))
        step_x = max(1, small_crop_width // 12)
        step_y = max(1, small_crop_height // 12)
        best = (-1.0, 0, 0)
        for top in range(0, small_height - small_crop_height + 1, step_y):
            for left in range(0, small_width - small_crop_width + 1, step_x):
                bottom, right = top + small_crop_height, left + small_crop_width
                total = (
                    integral[bottom, right]
                    - integral[top, right]
                    - integral[bottom, left]
                    + integral[top, left]
                )
                center_x = (left + small_crop_width / 2) / small_width
                center_y = (top + small_crop_height / 2) / small_height
                center_bias = 1.0 - 0.08 * math.hypot(center_x - 0.5, center_y - 0.5)
                score = float(
                    total / (small_crop_width * small_crop_height) * center_bias
                )
                if score > best[0]:
                    best = (score, left, top)
        left = min(width - crop_width, round(best[1] * width / small_width))
        top = min(height - crop_height, round(best[2] * height / small_height))
        return (left, top, crop_width, crop_height), max(0.0, best[0])
