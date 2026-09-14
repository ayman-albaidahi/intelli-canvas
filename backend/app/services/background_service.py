from __future__ import annotations

import json
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
MAX_BACKGROUND_BLUR = 40
MAX_BACKGROUND_SCALE = 5.0
MAX_BACKGROUND_OFFSET = 10000
BACKGROUND_CATEGORIES = {"general", "product", "studio", "social", "seasonal"}


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
        color = payload.get("color", payload.get("key_color"))
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
        background_blur = payload.get("background_blur", 0)
        if isinstance(background_blur, bool) or not isinstance(background_blur, int) or not 0 <= background_blur <= MAX_BACKGROUND_BLUR:
            raise BackgroundParamError(f"background_blur must be an integer from 0 to {MAX_BACKGROUND_BLUR}.")
        background_scale = payload.get("background_scale", 1.0)
        if isinstance(background_scale, bool) or not isinstance(background_scale, (int, float)) or not 0.1 <= background_scale <= MAX_BACKGROUND_SCALE:
            raise BackgroundParamError(f"background_scale must be a number from 0.1 to {MAX_BACKGROUND_SCALE}.")
        background_x = payload.get("background_x", 0)
        background_y = payload.get("background_y", 0)
        for name, value in (("background_x", background_x), ("background_y", background_y)):
            if isinstance(value, bool) or not isinstance(value, int) or not -MAX_BACKGROUND_OFFSET <= value <= MAX_BACKGROUND_OFFSET:
                raise BackgroundParamError(f"{name} must be an integer from {-MAX_BACKGROUND_OFFSET} to {MAX_BACKGROUND_OFFSET}.")
        shadow = payload.get("shadow", False)
        if not isinstance(shadow, bool):
            raise BackgroundParamError("shadow must be a boolean.")
        shadow_opacity = payload.get("shadow_opacity", 0.25)
        if isinstance(shadow_opacity, bool) or not isinstance(shadow_opacity, (int, float)) or not 0 <= shadow_opacity <= 1:
            raise BackgroundParamError("shadow_opacity must be a number from 0 to 1.")
        shadow_blur = payload.get("shadow_blur", 12)
        if isinstance(shadow_blur, bool) or not isinstance(shadow_blur, int) or not 0 <= shadow_blur <= MAX_BACKGROUND_BLUR:
            raise BackgroundParamError(f"shadow_blur must be an integer from 0 to {MAX_BACKGROUND_BLUR}.")
        shadow_offset_y = payload.get("shadow_offset_y", 10)
        if isinstance(shadow_offset_y, bool) or not isinstance(shadow_offset_y, int) or not -MAX_BACKGROUND_OFFSET <= shadow_offset_y <= MAX_BACKGROUND_OFFSET:
            raise BackgroundParamError("shadow_offset_y is out of range.")
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
                result = self._compose_replacement(image, mask, params, background)
                result.save(output_path, format="PNG")
                result.close()
        except Exception:
            if output_path.exists():
                output_path.unlink()
            raise
        return self._finish(image_id, output_path, "replace-background", {
            "background": background.get("color") or background.get("name"),
            "background_blur": params["background_blur"],
            "shadow": params["shadow"],
        })

    def preview_replace(self, image_id: str, params: dict[str, Any], background: dict[str, Any]) -> bytes:
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
                scaled = ImageOps.contain(source, (round(size[0] * params["background_scale"]), round(size[1] * params["background_scale"])))
                backdrop = Image.new("RGB", size, (0, 0, 0))
                left = (size[0] - scaled.width) // 2 + params["background_x"]
                top = (size[1] - scaled.height) // 2 + params["background_y"]
                backdrop.paste(scaled, (left, top))
                scaled.close()
                source.close()
        if params["background_blur"]:
            backdrop = backdrop.filter(ImageFilter.GaussianBlur(params["background_blur"]))
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
            shadow.putalpha(shadow_alpha.point(lambda value: round(value * params["shadow_opacity"])))
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
        temporary.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
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
            catalog.append({
                "name": name,
                "label": metadata.get("label", Path(name).stem.replace("_", " ").title()),
                "category": metadata.get("category", "general"),
                "width": width,
                "height": height,
                "mime_type": mime_type,
                "thumbnail_url": f"/api/background/backgrounds/{name}/thumbnail",
            })
        return sorted(catalog, key=lambda item: (item["category"], item["label"].lower()))

    def thumbnail_path(self, name: str) -> Path:
        if not isinstance(name, str) or not name or "/" in name or "\\" in name or ".." in name:
            raise FileValidationError("Background name is invalid.")
        source = self.storage_service.backgrounds_dir / name
        if not source.is_file():
            raise FileValidationError("Library background was not found.")
        thumbnail_dir = self.storage_service.resolve_storage_dir("background-thumbnails")
        thumbnail = thumbnail_dir / f"{Path(name).stem}.jpg"
        if not thumbnail.exists() or thumbnail.stat().st_mtime < source.stat().st_mtime:
            with Image.open(source) as image:
                preview = ImageOps.contain(image.convert("RGB"), (320, 200))
                canvas = Image.new("RGB", (320, 200), "#eeeeee")
                canvas.paste(preview, ((320 - preview.width) // 2, (200 - preview.height) // 2))
                canvas.save(thumbnail, format="JPEG", quality=85, optimize=True)
                preview.close()
                canvas.close()
        return thumbnail

    def save_background(self, file_obj: Any, filename: str, category: str = "general") -> str:
        if not isinstance(category, str) or category not in BACKGROUND_CATEGORIES:
            raise BackgroundParamError("category is not supported.")
        path = self.storage_service.save_file(file_obj, filename, destination="backgrounds")
        metadata = {
            "label": Path(path.name).stem.replace("_", " ").title(),
            "category": category,
        }
        manifest = self._read_manifest()
        manifest[path.name] = metadata
        self._write_manifest(manifest)
        return path.name
