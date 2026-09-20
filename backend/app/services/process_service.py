from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from PIL import Image

from ..domain.results import OperationResult
from ..operations.registry import operation_label, spec
from .file_service import FileStorageService
from .image_io_service import ImageIOService
from .image_session_service import ImageSessionService
from .process_operations import apply_chain, compute_histogram


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

    def adjustments(self, image_id: str, values: dict[str, Any]) -> dict[str, Any]:
        """Apply every requested adjustment in one pass, writing one file."""
        if not values:
            raise ValueError("No adjustments were requested.")
        return self._transform(
            image_id,
            "adjustments",
            "Adjustments",
            lambda source: apply_chain(source, values),
            history_parameters={
                "values": {key: value for key, value in values.items()}
            },
        )

    def histogram(self, image_id: str) -> dict[str, list[int]]:
        """Read the current image without updating session or history state."""
        source_path, _ = self.image_io._resolve_source(image_id)
        with Image.open(source_path) as source:
            return compute_histogram(source)

    def run_op(
        self, image_id: str, slug: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Dispatch a registered operation by its slug.

        Single entry point for the REST routes, replacing one wrapper method
        per operation. ``params`` are validated by the registry spec, so the
        direct API and the pipeline report identical error codes.
        """
        operation = spec(slug)
        clean = operation.validate(params or {})
        return self._transform(
            image_id,
            slug,
            operation_label(slug, clean),
            lambda source: operation.run(source, clean),
            history_parameters=clean,
        )

    def _transform(
        self,
        image_id: str,
        operation: str,
        history_label: str,
        transform: Callable[[Image.Image], Image.Image],
        history_parameters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        history_parameters = history_parameters or {}
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
        session = self.session_service.update_current_image(
            image_id,
            output_path.name,
            "processed",
            operation=history_label,
            parameters=history_parameters,
        )
        return OperationResult(
            image_id=image_id,
            width=width,
            height=height,
            format="png",
            mime_type="image/png",
            path=output_path,
            filename=output_path.name,
            # ``operation`` always identifies the endpoint; a parameter of the
            # same name (morphology's sub-operation) must not overwrite it.
            # ``revision`` is the new history index so clients can quote it
            # back as ``source_revision`` on the next request.
            public_extras={
                **history_parameters,
                "operation": operation,
                "revision": session.get("history_index", 0),
            },
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
