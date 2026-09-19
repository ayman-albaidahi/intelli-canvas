from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFont

from ..domain.results import OperationResult
from .file_service import FileStorageService, FileValidationError

# Candidate font paths across platforms (Linux distros, WSL, Windows).
_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/usr/local/share/fonts/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
)
_font_path: Path | None = None
_font_checked = False


def _resolve_font(size: int) -> ImageFont.FreeTypeFont:
    """Load a scalable TrueType font, falling back to Pillow's bitmap default."""
    global _font_path, _font_checked
    if not _font_checked:
        _font_checked = True
        _font_path = next(
            (Path(p) for p in _FONT_CANDIDATES if Path(p).is_file()), None
        )
    if _font_path is not None:
        try:
            return ImageFont.truetype(str(_font_path), size)
        except OSError:
            pass
    return ImageFont.load_default()


class LayerCompositorService:
    """Deterministically renders persisted layers over the current base image."""

    def __init__(
        self, session_service, storage_service: FileStorageService, repository
    ):
        self.session_service = session_service
        self.storage_service = storage_service
        self.repository = repository

    def compose(self, image_id: str, persist: bool = True) -> dict[str, Any]:
        session = self.session_service.get_session(image_id)
        if session is None:
            raise FileNotFoundError("Image session was not found.")
        source = self._source_path(session)
        with Image.open(source) as base:
            canvas = base.convert("RGBA")
            for layer in session.get("layers", []):
                if layer.get("visible", True):
                    self._render_layer(canvas, layer, image_id)
            output_path = self.storage_service.resolve_storage_destination(
                "processed", f"{session.get('base_stem', 'image')}_composite.png"
            )
            canvas.save(output_path, format="PNG")
            width, height = canvas.size
            canvas.close()
        updated = (
            self.session_service.update_current_image(
                image_id, output_path.name, "processed", "Composite layers"
            )
            if persist
            else None
        )
        return OperationResult(
            image_id=image_id,
            width=width,
            height=height,
            format="png",
            mime_type="image/png",
            path=output_path,
            filename=output_path.name,
            public_extras={
                "history_index": updated["history_index"] if updated else None
            },
        )

    def _source_path(self, session: dict[str, Any]) -> Path:
        filename = session.get("current_filename") or session.get("stored_filename")
        directory = (
            self.storage_service.processed_dir
            if session.get("current_storage") == "processed"
            else self.storage_service.uploads_dir
        )
        path = (directory / str(filename)).resolve()
        try:
            path.relative_to(directory.resolve())
        except ValueError as exc:
            raise FileValidationError("Image path escapes storage.") from exc
        if not path.is_file():
            raise FileNotFoundError("Stored image was not found.")
        return path

    def _render_layer(
        self, canvas: Image.Image, layer: dict[str, Any], image_id: str
    ) -> None:
        layer_type = layer.get("type")
        if layer_type == "image":
            rendered = self._image_layer(layer, image_id)
        elif layer_type == "text":
            rendered = self._text_layer(layer)
        elif layer_type in {"shape", "brush"}:
            rendered = self._vector_layer(layer)
        else:
            return
        opacity = max(0.0, min(1.0, float(layer.get("opacity", 1))))
        if opacity < 1:
            alpha = rendered.getchannel("A").point(lambda value: round(value * opacity))
            rendered.putalpha(alpha)
        self._composite(canvas, rendered, layer)
        rendered.close()

    def _image_layer(self, layer: dict[str, Any], image_id: str) -> Image.Image:
        asset = self.repository.get_asset_for_image(layer.get("asset_id", ""), image_id)
        if asset is None:
            raise FileNotFoundError("Layer image asset was not found.")
        path = (
            self.storage_service.resolve_storage_dir(asset["storage_category"])
            / asset["stored_filename"]
        )
        with Image.open(path) as image:
            width = max(1, round(float(layer.get("w", image.width))))
            height = max(1, round(float(layer.get("h", image.height))))
            return image.convert("RGBA").resize(
                (width, height), Image.Resampling.LANCZOS
            )

    def _text_layer(self, layer: dict[str, Any]) -> Image.Image:
        width = max(1, round(float(layer.get("w", 100))))
        height = max(1, round(float(layer.get("h", 40))))
        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        size = max(1, round(float(layer.get("fontSize", 26))))
        font = _resolve_font(size)
        draw.text(
            (6, height / 2),
            str(layer.get("text", "")),
            fill=layer.get("color", "#000000"),
            font=font,
            anchor="lm",
        )
        return image

    def _vector_layer(self, layer: dict[str, Any]) -> Image.Image:
        width = max(1, round(float(layer.get("w", 8))))
        height = max(1, round(float(layer.get("h", 8))))
        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        if layer.get("type") == "brush":
            points = layer.get("pointsRel", [])
            if len(points) > 1:
                offset_x, offset_y = width / 2, height / 2
                draw.line(
                    [(round(x + offset_x), round(y + offset_y)) for x, y in points],
                    fill=layer.get("color", "#000000"),
                    width=max(1, round(float(layer.get("strokeWidth", 1)))),
                    joint="curve",
                )
        else:
            box = (0, 0, width - 1, height - 1)
            stroke = layer.get("stroke", "#000000")
            fill = layer.get("fill", "#000000") if layer.get("fillOn") else None
            if layer.get("shape") == "ellipse":
                draw.ellipse(
                    box,
                    outline=stroke,
                    fill=fill,
                    width=max(1, round(float(layer.get("strokeWidth", 1)))),
                )
            elif layer.get("shape") == "line":
                draw.line(
                    (0, height - 1, width - 1, 0),
                    fill=stroke,
                    width=max(1, round(float(layer.get("strokeWidth", 1)))),
                )
            else:
                draw.rectangle(
                    box,
                    outline=stroke,
                    fill=fill,
                    width=max(1, round(float(layer.get("strokeWidth", 1)))),
                )
        return image

    def _composite(
        self, canvas: Image.Image, rendered: Image.Image, layer: dict[str, Any]
    ) -> None:
        angle = float(layer.get("rotation", 0))
        if angle:
            rendered = rendered.rotate(
                -angle, expand=True, resample=Image.Resampling.BICUBIC
            )
        center_x = float(layer.get("x", 0)) + float(layer.get("w", rendered.width)) / 2
        center_y = float(layer.get("y", 0)) + float(layer.get("h", rendered.height)) / 2
        left = round(center_x - rendered.width / 2)
        top = round(center_y - rendered.height / 2)
        blend = layer.get("blend", "source-over")
        if blend == "source-over":
            canvas.alpha_composite(rendered, (left, top))
            return
        region = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        region.alpha_composite(rendered, (left, top))
        if blend == "multiply":
            blended = ImageChops.multiply(canvas, region)
        elif blend == "screen":
            blended = ImageChops.screen(canvas, region)
        elif blend == "overlay":
            blended = ImageChops.overlay(canvas, region)
        elif blend == "darken":
            blended = ImageChops.darker(canvas, region)
        elif blend == "lighten":
            blended = ImageChops.lighter(canvas, region)
        else:
            canvas.alpha_composite(rendered, (left, top))
            return
        canvas.alpha_composite(blended)
