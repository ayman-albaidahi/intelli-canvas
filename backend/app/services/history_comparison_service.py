from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

from .file_service import FileStorageService
from .image_session_service import ImageSessionService


class HistoryComparisonService:
    def __init__(self, session_service: ImageSessionService, storage_service: FileStorageService):
        self.session_service = session_service
        self.storage_service = storage_service

    def entry(self, image_id: str, index: int) -> dict:
        if self.session_service.get_session(image_id) is None:
            raise FileNotFoundError("Image session was not found.")
        result = self.session_service.repository.get_history_entry(image_id, index)
        if result is None:
            raise ValueError("History index is out of range.")
        return result

    def path_for(self, image_id: str, index: int) -> Path:
        entry = self.entry(image_id, index)
        directory = self.storage_service.resolve_storage_dir(entry["storage"])
        path = (directory / entry["filename"]).resolve()
        try:
            path.relative_to(directory.resolve())
        except ValueError as exc:
            raise ValueError("History file path is invalid.") from exc
        if not path.is_file():
            raise FileNotFoundError("History image was not found.")
        return path

    def image_bytes(self, image_id: str, index: int) -> bytes:
        path = self.path_for(image_id, index)
        return path.read_bytes()

    def compare(self, image_id: str, from_index: int, to_index: int) -> dict:
        source = self.entry(image_id, from_index)
        target = self.entry(image_id, to_index)
        with Image.open(self.path_for(image_id, from_index)) as source_image, Image.open(self.path_for(image_id, to_index)) as target_image:
            source_size = source_image.size
            target_size = target_image.size
        return {
            "from": {**self._public_entry(source), "width": source_size[0], "height": source_size[1]},
            "to": {**self._public_entry(target), "width": target_size[0], "height": target_size[1]},
            "same_dimensions": source_size == target_size,
        }

    def diff_bytes(self, image_id: str, from_index: int, to_index: int, mode: str = "absolute", threshold: int = 0) -> bytes:
        if mode not in {"absolute", "heatmap", "threshold"}:
            raise ValueError("Diff mode is not supported.")
        if isinstance(threshold, bool) or not isinstance(threshold, int) or not 0 <= threshold <= 255:
            raise ValueError("Diff threshold must be an integer from 0 to 255.")
        with Image.open(self.path_for(image_id, from_index)) as before, Image.open(self.path_for(image_id, to_index)) as after:
            before_rgba = before.convert("RGBA")
            after_rgba = after.convert("RGBA")
            if before_rgba.size != after_rgba.size:
                raise ValueError("History images must have matching dimensions.")
            difference = ImageChops.difference(before_rgba, after_rgba)
            if mode == "absolute":
                result = difference
            else:
                score = ImageOps.grayscale(difference)
                if threshold:
                    score = score.point(lambda value: 255 if value >= threshold else 0)
                if mode == "heatmap":
                    result = ImageOps.colorize(score, black="#101018", white="#ff5b78").convert("RGBA")
                else:
                    result = Image.merge("RGBA", (score, score, score, Image.new("L", score.size, 255)))
                score.close()
            buffer = BytesIO()
            result.save(buffer, format="PNG")
            result.close()
            before_rgba.close()
            after_rgba.close()
            return buffer.getvalue()

    @staticmethod
    def _public_entry(entry: dict) -> dict:
        return {
            "index": entry["history_index"],
            "operation": entry["operation"],
            "time": entry["created_at"],
            "parameters": entry.get("parameters", {}),
        }
