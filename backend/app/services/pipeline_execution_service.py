from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image

from .file_service import FileStorageService
from .image_session_service import ImageSessionService
from .pipeline_service import PipelineService
from .process_operations import (
    apply_blur,
    apply_brightness,
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
)
from .smart_crop_service import SmartCropService


class PipelineExecutionService:
    def __init__(self, session_service: ImageSessionService, storage_service: FileStorageService):
        self.session_service = session_service
        self.storage_service = storage_service

    def execute(self, image_id: str, pipeline: dict[str, Any], *, persist: bool, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        source_path = self._source_path(image_id)
        nodes = PipelineService.validate_nodes(pipeline.get("nodes", []))
        active_nodes = [node for node in nodes if node.get("enabled", True)]
        cache_hash = self.cache_hash(source_path, nodes)
        cache_path = self.storage_service.processed_dir / f"pipeline-cache-{cache_hash}.png"
        cache_hit = cache_path.is_file()
        if not cache_hit:
            self._render(source_path, cache_path, active_nodes)
        if persist:
            session = self.session_service.get_session(image_id)
            if session is None:
                raise FileNotFoundError("Image session was not found.")
            history_parameters = {"pipeline_hash": cache_hash, "enabled_nodes": len(active_nodes), "source_history_index": 0}
            if metadata:
                history_parameters.update(metadata)
            self.session_service.update_current_image(
                image_id,
                cache_path.name,
                "processed",
                operation="Apply pipeline",
                parameters=history_parameters,
            )
        with Image.open(cache_path) as result:
            width, height = result.size
        return {
            "image_id": image_id,
            "filename": cache_path.name,
            "path": cache_path,
            "format": "png",
            "mime_type": "image/png",
            "width": width,
            "height": height,
            "pipeline_hash": cache_hash,
            "cache_hit": cache_hit,
            "source_history_index": 0,
            "persisted": persist,
        }

    @staticmethod
    def cache_hash(source_path: Path, nodes: list[dict[str, Any]]) -> str:
        digest = hashlib.sha256()
        with source_path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        digest.update(json.dumps(nodes, sort_keys=True, separators=(",", ":")).encode())
        return digest.hexdigest()[:32]

    def _source_path(self, image_id: str) -> Path:
        if self.session_service.get_session(image_id) is None:
            raise FileNotFoundError("Image session was not found.")
        entry = self.session_service.repository.get_history_entry(image_id, 0)
        if entry is None:
            raise ValueError("Pipeline source history state was not found.")
        directory = self.storage_service.resolve_storage_dir(entry["storage"])
        path = (directory / entry["filename"]).resolve()
        try:
            path.relative_to(directory.resolve())
        except ValueError as exc:
            raise ValueError("Pipeline source path is invalid.") from exc
        if not path.is_file():
            raise FileNotFoundError("Pipeline source image was not found.")
        return path

    @staticmethod
    def _render(source_path: Path, output_path: Path, nodes: list[dict[str, Any]]) -> None:
        with Image.open(source_path) as source:
            current = source.convert("RGBA")
            try:
                for node in nodes:
                    next_image = PipelineExecutionService._apply(current, node["operation"], node.get("parameters", {}))
                    if next_image is not current:
                        current.close()
                    current = next_image.convert("RGBA")
                    if next_image is not current:
                        next_image.close()
                current.save(output_path, format="PNG", optimize=True)
            finally:
                current.close()

    @staticmethod
    def _apply(image: Image.Image, operation: str, params: dict[str, Any]) -> Image.Image:
        if operation == "grayscale": return apply_grayscale(image)
        if operation == "negative": return apply_negative(image)
        if operation == "brightness": return apply_brightness(image, int(params.get("value", 100)))
        if operation == "contrast": return apply_contrast(image, int(params.get("value", 100)))
        if operation == "saturation": return apply_saturation(image, int(params.get("value", 100)))
        if operation == "gamma": return apply_gamma(image, float(params.get("value", 1)))
        if operation == "blur": return apply_blur(image, int(params.get("value", 2)))
        if operation == "sharpen": return apply_sharpen(image, int(params.get("value", 1)))
        if operation == "threshold": return apply_threshold(image, int(params.get("value", 128)))
        if operation == "sobel": return apply_sobel(image, int(params.get("ksize", 3)))
        if operation == "laplacian": return apply_laplacian(image)
        if operation == "median-filter": return apply_median_filter(image, int(params.get("ksize", 3)))
        if operation == "morphology": return apply_morphology(image, str(params.get("operation", "open")), int(params.get("ksize", 3)))
        if operation == "smart-crop":
            ratio = SmartCropService.parse_aspect_ratio(params.get("aspect_ratio", "original"))
            box, _score = SmartCropService._find_box(image, ratio)
            return image.crop((box[0], box[1], box[0] + box[2], box[1] + box[3]))
        raise ValueError("Pipeline operation is not supported.")
