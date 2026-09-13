from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageFilter, ImageOps

from .file_service import FileStorageService, FileValidationError
from .image_io_service import ImageIOService
from .image_session_service import ImageSessionService

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_FEATHER = 25
MAX_SMOOTH = 5


class BackgroundParamError(ValueError):
    """Raised when mask parameters fail validation."""


class BackgroundService:
    """Color-mask background removal and replacement on the session image."""

    def __init__(self, session_service: ImageSessionService, storage_service: FileStorageService | None = None):
        self.session_service = session_service
        self.storage_service = storage_service or FileStorageService()
        self.image_io = ImageIOService(session_service, self.storage_service)

    @staticmethod
    def validate_params(payload: dict[str, Any]) -> dict[str, Any]:
        color = payload.get("color")
        if not isinstance(color, str) or not HEX_COLOR.match(color):
            raise BackgroundParamError("color must be a hex value like #ff0000.")
        tolerance = payload.get("tolerance", 25)
        if isinstance(tolerance, bool) or not isinstance(tolerance, int) or not 0 <= tolerance <= 100:
            raise BackgroundParamError("tolerance must be an integer from 0 to 100.")
        feather = payload.get("feather", 2)
        if isinstance(feather, bool) or not isinstance(feather, int) or not 0 <= feather <= MAX_FEATHER:
            raise BackgroundParamError(f"feather must be an integer from 0 to {MAX_FEATHER}.")
        smooth = payload.get("smooth", 1)
        if isinstance(smooth, bool) or not isinstance(smooth, int) or not 0 <= smooth <= MAX_SMOOTH:
            raise BackgroundParamError(f"smooth must be an integer from 0 to {MAX_SMOOTH}.")
        invert = payload.get("invert", False)
        if not isinstance(invert, bool):
            raise BackgroundParamError("invert must be a boolean.")
        return {
            "color": color.lower(),
            "tolerance": tolerance,
            "feather": feather,
            "smooth": smooth,
            "invert": invert,
        }

    def build_mask(self, image: Image.Image, params: dict[str, Any]) -> Image.Image:
        """L-mode mask: 255 = keep, 0 = remove. Chebyshev channel distance."""
        key = params["color"]
        key_rgb = tuple(int(key[i:i + 2], 16) for i in (1, 3, 5))
        rgb = image.convert("RGB")
        solid = Image.new("RGB", rgb.size, key_rgb)
        diff = ImageChops.difference(rgb, solid)
        distance = ImageChops.lighter(ImageChops.lighter(diff.split()[0], diff.split()[1]), diff.split()[2])
        threshold = params["tolerance"] * 255 // 100
        mask = distance.point(lambda value: 255 if value > threshold else 0)
        mask = mask.convert("L")
        smooth = params["smooth"]
        for _ in range(smooth):
            mask = mask.filter(ImageFilter.MinFilter(3))
            mask = mask.filter(ImageFilter.MaxFilter(3))
        if params["invert"]:
            mask = ImageOps.invert(mask)
        if params["feather"] > 0:
            mask = mask.filter(ImageFilter.GaussianBlur(params["feather"]))
        return mask

    def _session_image(self, image_id: str) -> Image.Image:
        source_path, _ = self.image_io._resolve_source(image_id)
        return Image.open(source_path)

    def _finish(self, image_id: str, output_path: Path, operation: str, extra: dict[str, Any]) -> dict[str, Any]:
        with Image.open(output_path) as image:
            width, height = image.size
        label = "Remove background" if operation == "remove-background" else "Replace background"
        self.session_service.update_current_image(image_id, output_path.name, "processed", operation=label)
        self.session_service.update_current_image(image_id, output_path.name, "processed")
        return {
            "image_id": image_id,
            "format": "png",
            "mime_type": "image/png",
            "filename": output_path.name,
            "width": width,
            "height": height,
            "operation": operation,
            **extra,
        }

    def _new_output_path(self, image_id: str, operation: str) -> Path:
        session = self.session_service.get_session(image_id)
        base_stem = session.get("base_stem") if session else None
        if not isinstance(base_stem, str) or not base_stem:
            base_stem = "image"
        filename = self.storage_service.generate_safe_filename(
            f"{base_stem}_{operation}.png", directory=self.storage_service.processed_dir
        )
        return self.storage_service.processed_dir / filename

    def preview_mask(self, image_id: str, params: dict[str, Any]) -> bytes:
        with self._session_image(image_id) as image:
            mask = self.build_mask(image, params)
            buffer = BytesIO()
            mask.save(buffer, format="PNG")
            return buffer.getvalue()

    def remove_background(self, image_id: str, params: dict[str, Any]) -> dict[str, Any]:
        output_path = self._new_output_path(image_id, "no-background")
        try:
            with self._session_image(image_id) as image:
                mask = self.build_mask(image, params)
                result = image.convert("RGBA")
                result.putalpha(mask)
                result.save(output_path, format="PNG")
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        return self._finish(image_id, output_path, "remove-background", {
            "color": params["color"],
            "tolerance": params["tolerance"],
        })

    def replace_background(self, image_id: str, params: dict[str, Any], background: dict[str, Any]) -> dict[str, Any]:
        output_path = self._new_output_path(image_id, "replaced-background")
        try:
            with self._session_image(image_id) as image:
                mask = self.build_mask(image, params)
                size = image.size
                if "color" in background:
                    backdrop = Image.new("RGB", size, background["color"])
                else:
                    with Image.open(background["path"]) as library_image:
                        backdrop = ImageOps.fit(library_image.convert("RGB"), size)
                backdrop.paste(image.convert("RGB"), (0, 0), mask)
                backdrop.save(output_path, format="PNG")
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        return self._finish(image_id, output_path, "replace-background", {
            "background": background.get("color") or background.get("name"),
        })

    def validate_replace_target(self, payload: dict[str, Any]) -> dict[str, Any]:
        color = payload.get("background_color")
        name = payload.get("background_name")
        if color and name:
            raise BackgroundParamError("Choose either a solid color or a library background, not both.")
        if color:
            if not isinstance(color, str) or not HEX_COLOR.match(color):
                raise BackgroundParamError("background_color must be a hex value like #ffffff.")
            return {"color": tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))}
        if name:
            if not isinstance(name, str) or "/" in name or "\\" in name or ".." in name:
                raise BackgroundParamError("background_name is invalid.")
            path = self.storage_service.backgrounds_dir / name
            if not path.is_file():
                raise FileValidationError("Library background was not found.")
            return {"name": name, "path": path}
        raise BackgroundParamError("A background_color or background_name is required.")

    def list_backgrounds(self) -> list[str]:
        directory = self.storage_service.backgrounds_dir
        return sorted(
            p.name for p in directory.iterdir()
            if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
        )

    def save_background(self, file_obj: Any, filename: str) -> str:
        path = self.storage_service.save_file(file_obj, filename, destination="backgrounds")
        return path.name
