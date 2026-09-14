"""Operation registry and processing nodes (Phase 2).

Each edit is a versioned Operation (spec + params) with separated preview
and apply paths: preview returns bytes without touching state, apply records
a node and updates the active session + history.
"""
from __future__ import annotations

import io
import uuid
from pathlib import Path
from typing import Any

from PIL import Image, ImageEnhance

from .resource_guard import ResourceGuard


class UnknownOperationError(ValueError):
    pass


class OperationParamError(ValueError):
    pass


# ---- parameter validation ----

def _validate_brightness(params: dict[str, Any]) -> dict[str, Any]:
    value = params.get("value")
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 200:
        raise OperationParamError("Brightness value must be an integer from 0 to 200.")
    return {"value": value}


# ---- runners (pure Pillow, deterministic) ----

def _run_brightness(image: Image.Image, params: dict[str, Any]) -> Image.Image:
    value = params["value"]
    if value == 100:
        return image.copy()
    return ImageEnhance.Brightness(image).enhance(value / 100)


def _validate_contrast(params: dict[str, Any]) -> dict[str, Any]:
    value = params.get("value")
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 200:
        raise OperationParamError("Contrast value must be an integer from 0 to 200.")
    return {"value": value}


def _run_contrast(image: Image.Image, params: dict[str, Any]) -> Image.Image:
    value = params["value"]
    if value == 100:
        return image.copy()
    return ImageEnhance.Contrast(image).enhance(value / 100)


REGISTRY: dict[str, dict[str, Any]] = {
    "brightness": {
        "label": "Brightness",
        "validate": _validate_brightness,
        "run": _run_brightness,
    },
    "contrast": {
        "label": "Contrast",
        "validate": _validate_contrast,
        "run": _run_contrast,
    },
}


def validate_params(op_type: str, params: dict[str, Any]) -> dict[str, Any]:
    spec = REGISTRY.get(op_type)
    if spec is None:
        raise UnknownOperationError(f"Unknown operation type: {op_type}")
    return spec["validate"](params or {})


def run_operation(op_type: str, image: Image.Image, params: dict[str, Any]) -> Image.Image:
    spec = REGISTRY.get(op_type)
    if spec is None:
        raise UnknownOperationError(f"Unknown operation type: {op_type}")
    return spec["run"](image, params)


def operation_label(op_type: str, params: dict[str, Any]) -> str:
    if op_type == "brightness":
        value = params.get("value")
        return f"Brightness {value}%" if value is not None else "Brightness"
    return op_type.capitalize()


class NodeService:
    """Applies registry operations to the active session image."""

    def __init__(self, session_service, storage_service):
        self.session_service = session_service
        self.storage_service = storage_service

    def _session(self, image_id: str):
        session = self.session_service.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        return session

    def _source_image(self, image_id: str) -> Image.Image:
        from .file_service import FileStorageService

        session = self._session(image_id)
        storage = FileStorageService()
        directory = (
            storage.processed_dir
            if session.get("current_storage") == "processed"
            else storage.uploads_dir
        )
        source_path = Path(directory) / (session.get("current_filename") or "")
        if not source_path.is_file():
            raise FileNotFoundError("Stored image was not found.")
        return Image.open(source_path)

    def _output_path(self, image_id: str, tag: str) -> Any:
        session = self._session(image_id)
        base_stem = session.get("base_stem") or "image"
        filename = self.storage_service.generate_safe_filename(
            f"{base_stem}_{tag}.png",
            directory=self.storage_service.processed_dir,
        )
        return self.storage_service.processed_dir / filename

    def preview_bytes(self, image_id: str, op_type: str, params: dict[str, Any]) -> bytes:
        started = ResourceGuard.time_budget()
        clean = validate_params(op_type, params)
        with self._source_image(image_id) as source:
            result = run_operation(op_type, source, clean)
            buffer = io.BytesIO()
            result.save(buffer, format="PNG")
            result.close()
        ResourceGuard.assert_within_budget(started)
        return buffer.getvalue()

    def apply_operation(self, image_id: str, op_type: str, params: dict[str, Any]) -> dict[str, Any]:
        started = ResourceGuard.time_budget()
        clean = validate_params(op_type, params)
        label = operation_label(op_type, clean)
        output_path = self._output_path(image_id, op_type)
        node_id = "n" + uuid.uuid4().hex[:12]
        try:
            with self._source_image(image_id) as source:
                result = run_operation(op_type, source, clean)
                result.save(output_path, format="PNG")
                result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        with Image.open(output_path) as image:
            width, height = image.size
        self.session_service.update_current_image(
            image_id, output_path.name, "processed", operation=label
        )
        ResourceGuard.assert_within_budget(started)
        node = {
            "node_id": node_id,
            "type": op_type,
            "operation": {"type": op_type, "params": clean, "label": label},
            "filename": output_path.name,
            "width": width,
            "height": height,
        }
        return node
