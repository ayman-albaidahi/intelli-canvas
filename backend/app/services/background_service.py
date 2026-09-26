from __future__ import annotations

import json
import re
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageFilter, ImageOps

from ..domain.results import OperationResult
from .file_service import FileStorageService, FileValidationError
from .image_io_service import ImageIOService
from .image_session_service import ImageSessionService

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_FEATHER = 25
MAX_SMOOTH = 5
MAX_BACKGROUND_BLUR = 40
MAX_BACKGROUND_SCALE = 5.0
MAX_BACKGROUND_OFFSET = 10000
BACKGROUND_CATEGORIES = {"general", "product", "studio", "social", "seasonal"}

# Neutral values used when a background parameter is omitted from a request.
_BACKGROUND_DEFAULTS = {
    "tolerance": 25,
    "feather": 2,
    "smooth": 1,
    "background_blur": 0,
    "background_scale": 1.0,
    "background_x": 0,
    "background_y": 0,
    "shadow_opacity": 0.25,
    "shadow_blur": 12,
    "shadow_offset_y": 10,
}


class BackgroundParamError(ValueError):
    """Raised when mask parameters fail validation."""


class BackgroundService:
    """Color-mask background removal and replacement on the session image."""

    def __init__(
        self,
        session_service: ImageSessionService,
        storage_service: FileStorageService,
    ):
        self.session_service = session_service
        self.storage_service = storage_service
        self.image_io = ImageIOService(session_service, self.storage_service)

    @staticmethod
    def validate_params(payload: dict[str, Any]) -> dict[str, Any]:
        from ..validation import InvalidRequestError, require_int, require_number

        color = payload.get("color", payload.get("key_color"))
        if not isinstance(color, str) or not HEX_COLOR.match(color):
            raise BackgroundParamError("color must be a hex value like #ff0000.")

        def bounded(name, low, high, *, numeric=False, label=None):
            value = payload.get(name)
            default = _BACKGROUND_DEFAULTS[name]
            if value is None:
                return default
            label = label or name
            try:
                return (
                    require_number(value, low=low, high=high, name=label)
                    if numeric
                    else require_int(value, low=low, high=high, name=label)
                )
            except InvalidRequestError as exc:
                raise BackgroundParamError(str(exc)) from exc

        tolerance = bounded("tolerance", 0, 100)
        feather = bounded("feather", 0, MAX_FEATHER)
        smooth = bounded("smooth", 0, MAX_SMOOTH)
        invert = payload.get("invert", False)
        if not isinstance(invert, bool):
            raise BackgroundParamError("invert must be a boolean.")
        background_blur = bounded("background_blur", 0, MAX_BACKGROUND_BLUR)
        background_scale = bounded(
            "background_scale", 0.1, MAX_BACKGROUND_SCALE, numeric=True
        )
        background_x = bounded(
            "background_x", -MAX_BACKGROUND_OFFSET, MAX_BACKGROUND_OFFSET
        )
        background_y = bounded(
            "background_y", -MAX_BACKGROUND_OFFSET, MAX_BACKGROUND_OFFSET
        )
        shadow = payload.get("shadow", False)
        if not isinstance(shadow, bool):
            raise BackgroundParamError("shadow must be a boolean.")
        shadow_opacity = bounded("shadow_opacity", 0, 1, numeric=True)
        shadow_blur = bounded("shadow_blur", 0, MAX_BACKGROUND_BLUR)
        shadow_offset_y = bounded(
            "shadow_offset_y",
            -MAX_BACKGROUND_OFFSET,
            MAX_BACKGROUND_OFFSET,
            label="shadow_offset_y",
        )

        return {
            "color": color.lower(),
            "tolerance": tolerance,
            "feather": feather,
            "smooth": smooth,
            "invert": invert,
            "background_blur": background_blur,
            "background_scale": float(background_scale),
            "background_x": background_x,
            "background_y": background_y,
            "shadow": shadow,
            "shadow_opacity": float(shadow_opacity),
            "shadow_blur": shadow_blur,
            "shadow_offset_y": shadow_offset_y,
        }

    def build_mask(self, image: Image.Image, params: dict[str, Any]) -> Image.Image:
        """L-mode mask: 255 = keep, 0 = remove. Chebyshev channel distance."""
        key = params["color"]
        key_rgb = tuple(int(key[i : i + 2], 16) for i in (1, 3, 5))
        rgb = image.convert("RGB")
        solid = Image.new("RGB", rgb.size, key_rgb)
        diff = ImageChops.difference(rgb, solid)
        distance = ImageChops.lighter(
            ImageChops.lighter(diff.split()[0], diff.split()[1]), diff.split()[2]
        )
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

    def _finish(
        self, image_id: str, output_path: Path, operation: str, extra: dict[str, Any]
    ) -> dict[str, Any]:
        with Image.open(output_path) as image:
            width, height = image.size
        label = (
            "Remove background"
            if operation == "remove-background"
            else "Replace background"
        )
        self.session_service.update_current_image(
            image_id, output_path.name, "processed", operation=label
        )
        return OperationResult(
            image_id=image_id,
            width=width,
            height=height,
            format="png",
            mime_type="image/png",
            path=output_path,
            filename=output_path.name,
            public_extras={"operation": operation, **extra},
        )

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

    def remove_background(
        self, image_id: str, params: dict[str, Any]
    ) -> dict[str, Any]:
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
        return self._finish(
            image_id,
            output_path,
            "remove-background",
            {
                "color": params["color"],
                "tolerance": params["tolerance"],
            },
        )

    def replace_background(
        self, image_id: str, params: dict[str, Any], background: dict[str, Any]
    ) -> dict[str, Any]:
        output_path = self._new_output_path(image_id, "replaced-background")
        try:
            with self._session_image(image_id) as image:
                mask = self.build_mask(image, params)
                result = self._compose_replacement(image, mask, params, background)
                result.save(output_path, format="PNG")
                result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        return self._finish(
            image_id,
            output_path,
            "replace-background",
            {
                "background": background.get("color") or background.get("name"),
                "background_blur": params["background_blur"],
                "shadow": params["shadow"],
            },
        )

    def preview_replace(
        self, image_id: str, params: dict[str, Any], background: dict[str, Any]
    ) -> bytes:
        with self._session_image(image_id) as image:
            mask = self.build_mask(image, params)
            result = self._compose_replacement(image, mask, params, background)
            buffer = BytesIO()
            result.save(buffer, format="PNG")
            result.close()
            return buffer.getvalue()

    def _compose_replacement(
        self,
        image: Image.Image,
        mask: Image.Image,
        params: dict[str, Any],
        background: dict[str, Any],
    ) -> Image.Image:
        size = image.size
        if "color" in background:
            backdrop = Image.new("RGB", size, background["color"])
        else:
            with Image.open(background["path"]) as library_image:
                source = library_image.convert("RGB")
                scaled = ImageOps.contain(
                    source,
                    (
                        round(size[0] * params["background_scale"]),
                        round(size[1] * params["background_scale"]),
                    ),
                )
                backdrop = Image.new("RGB", size, (0, 0, 0))
                left = (size[0] - scaled.width) // 2 + params["background_x"]
                top = (size[1] - scaled.height) // 2 + params["background_y"]
                backdrop.paste(scaled, (left, top))
                scaled.close()
                source.close()
        if params["background_blur"]:
            backdrop = backdrop.filter(
                ImageFilter.GaussianBlur(params["background_blur"])
            )
        result = backdrop.convert("RGBA")
        foreground = image.convert("RGBA")
        if params["shadow"]:
            shadow_alpha = mask.filter(ImageFilter.GaussianBlur(params["shadow_blur"]))
            if params["shadow_offset_y"]:
                shifted = Image.new("L", size, 0)
                shifted.paste(shadow_alpha, (0, params["shadow_offset_y"]))
                shadow_alpha.close()
                shadow_alpha = shifted
            shadow = Image.new("RGBA", size, (0, 0, 0, 0))
            shadow.putalpha(
                shadow_alpha.point(
                    lambda value: round(value * params["shadow_opacity"])
                )
            )
            result.alpha_composite(shadow)
            shadow.close()
            shadow_alpha.close()
        result.paste(foreground, (0, 0), mask)
        foreground.close()
        return result

    def validate_replace_target(self, payload: dict[str, Any]) -> dict[str, Any]:
        color = payload.get("background_color")
        name = payload.get("background_name")
        if color and name:
            raise BackgroundParamError(
                "Choose either a solid color or a library background, not both."
            )
        if color:
            if not isinstance(color, str) or not HEX_COLOR.match(color):
                raise BackgroundParamError(
                    "background_color must be a hex value like #ffffff."
                )
            return {"color": tuple(int(color[i : i + 2], 16) for i in (1, 3, 5))}
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
            p.name
            for p in directory.iterdir()
            if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
        )

    @property
    def _manifest_path(self) -> Path:
        return self.storage_service.storage_root / "backgrounds.json"

    def _read_manifest(self) -> dict[str, dict[str, Any]]:
        try:
            data = json.loads(self._manifest_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def _write_manifest(self, manifest: dict[str, dict[str, Any]]) -> None:
        temporary = self._manifest_path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8"
        )
        temporary.replace(self._manifest_path)

    def list_background_catalog(self) -> list[dict[str, Any]]:
        manifest = self._read_manifest()
        catalog = []
        for name in self.list_backgrounds():
            path = self.storage_service.backgrounds_dir / name
            with Image.open(path) as image:
                width, height = image.size
                mime_type = Image.MIME.get(image.format or "PNG", "image/png")
            metadata = manifest.get(name, {})
            catalog.append(
                {
                    "name": name,
                    "label": metadata.get(
                        "label", Path(name).stem.replace("_", " ").title()
                    ),
                    "category": metadata.get("category", "general"),
                    "width": width,
                    "height": height,
                    "mime_type": mime_type,
                    "thumbnail_url": f"/api/background/backgrounds/{name}/thumbnail",
                }
            )
        return sorted(
            catalog, key=lambda item: (item["category"], item["label"].lower())
        )

    def thumbnail_path(self, name: str) -> Path:
        if (
            not isinstance(name, str)
            or not name
            or "/" in name
            or "\\" in name
            or ".." in name
        ):
            raise FileValidationError("Background name is invalid.")
        source = self.storage_service.backgrounds_dir / name
        if not source.is_file():
            raise FileValidationError("Library background was not found.")
        thumbnail_dir = self.storage_service.resolve_storage_dir(
            "background-thumbnails"
        )
        thumbnail = thumbnail_dir / f"{Path(name).stem}.jpg"
        if not thumbnail.exists() or thumbnail.stat().st_mtime < source.stat().st_mtime:
            with Image.open(source) as image:
                preview = ImageOps.contain(image.convert("RGB"), (320, 200))
                canvas = Image.new("RGB", (320, 200), "#eeeeee")
                canvas.paste(
                    preview, ((320 - preview.width) // 2, (200 - preview.height) // 2)
                )
                canvas.save(thumbnail, format="JPEG", quality=85, optimize=True)
                preview.close()
                canvas.close()
        return thumbnail

    def save_background(
        self, file_obj: Any, filename: str, category: str = "general"
    ) -> str:
        if not isinstance(category, str) or category not in BACKGROUND_CATEGORIES:
            raise BackgroundParamError("category is not supported.")
        path = self.storage_service.save_file(
            file_obj, filename, destination="backgrounds"
        )
        metadata = {
            "label": Path(path.name).stem.replace("_", " ").title(),
            "category": category,
        }
        manifest = self._read_manifest()
        manifest[path.name] = metadata
        self._write_manifest(manifest)
        return path.name
