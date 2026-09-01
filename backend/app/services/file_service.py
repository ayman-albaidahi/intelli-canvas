from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import BinaryIO

from werkzeug.utils import secure_filename

from backend.app.config import Config

SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
SUPPORTED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/bmp",
}


class FileValidationError(ValueError):
    """Raised when a file fails backend validation."""


class FileStorageService:
    """Utility service for validating and storing image files with safe paths."""

    def __init__(self, storage_root: str | os.PathLike[str] | None = None, max_file_size: int | None = None):
        project_root = Path(__file__).resolve().parents[2]
        root = Path(storage_root) if storage_root is not None else project_root / "storage"
        self.storage_root = root.resolve()
        self.max_file_size = max_file_size if max_file_size is not None else Config.MAX_FILE_SIZE

    @property
    def uploads_dir(self) -> Path:
        return self.resolve_storage_dir("uploads")

    @property
    def processed_dir(self) -> Path:
        return self.resolve_storage_dir("processed")

    @property
    def backgrounds_dir(self) -> Path:
        return self.resolve_storage_dir("backgrounds")

    def resolve_storage_dir(self, directory_name: str) -> Path:
        directory = (self.storage_root / directory_name).resolve()
        directory.mkdir(parents=True, exist_ok=True)
        self._ensure_within_storage_root(directory)
        return directory

    def _ensure_within_storage_root(self, candidate: Path) -> None:
        try:
            candidate.relative_to(self.storage_root)
        except ValueError as exc:
            raise FileValidationError("Resolved path escapes the storage root.") from exc

    def _get_extension(self, filename: str) -> str:
        return Path(filename).suffix.lower()

    def validate_file(self, file_obj: BinaryIO, filename: str, *, max_size: int | None = None) -> None:
        if file_obj is None:
            raise FileValidationError("File object is required.")

        if not filename or not filename.strip():
            raise FileValidationError("Filename is required.")

        extension = self._get_extension(filename)
        if extension not in SUPPORTED_IMAGE_EXTENSIONS:
            raise FileValidationError("Unsupported file type.")

        if max_size is None:
            max_size = self.max_file_size
        if max_size <= 0:
            raise FileValidationError("Maximum file size must be positive.")

        position = file_obj.tell() if hasattr(file_obj, "tell") else 0
        file_obj.seek(0, os.SEEK_END)
        size = file_obj.tell()
        file_obj.seek(position)

        if size <= 0:
            raise FileValidationError("File is empty.")
        if size > max_size:
            raise FileValidationError("File exceeds the allowed size.")

        mime_type = self._detect_mime_type(file_obj, filename)
        if mime_type not in SUPPORTED_MIME_TYPES:
            raise FileValidationError("Invalid or unsupported file content type.")

    def detect_mime_type(self, file_obj: BinaryIO, filename: str) -> str:
        if hasattr(file_obj, "content_type"):
            content_type = getattr(file_obj, "content_type", "")
            if content_type:
                return content_type.split(";", 1)[0].lower()

        if hasattr(file_obj, "mimetype"):
            mimetype = getattr(file_obj, "mimetype", "")
            if mimetype:
                return mimetype.split(";", 1)[0].lower()

        extension = self._get_extension(filename)
        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
        }
        return mime_map.get(extension, "")

    def _detect_mime_type(self, file_obj: BinaryIO, filename: str) -> str:
        return self.detect_mime_type(file_obj, filename)

    def generate_safe_filename(self, filename: str, *, directory: str | Path | None = None) -> str:
        safe_name = secure_filename(filename)
        if not safe_name or safe_name in {".", ".."}:
            safe_name = "uploaded_file"

        extension = self._get_extension(filename)
        if extension not in SUPPORTED_IMAGE_EXTENSIONS:
            raise FileValidationError("Unsupported file type.")

        if not extension and safe_name:
            extension = ".png"

        unique_id = uuid.uuid4().hex
        basename = Path(safe_name).stem or "uploaded_file"
        sanitized_basename = secure_filename(basename)
        if not sanitized_basename:
            sanitized_basename = unique_id

        final_filename = f"{sanitized_basename}_{unique_id}{extension}"

        target_dir = Path(directory) if directory is not None else self.uploads_dir
        target_dir = Path(target_dir).resolve()
        self._ensure_within_storage_root(target_dir)

        candidate = target_dir / final_filename
        counter = 1
        while candidate.exists():
            candidate = target_dir / f"{sanitized_basename}_{unique_id}_{counter}{extension}"
            counter += 1

        return candidate.name

    def save_file(self, file_obj: BinaryIO, filename: str, *, destination: str | Path | None = None, max_size: int | None = None) -> Path:
        self.validate_file(file_obj, filename, max_size=max_size)

        target_dir = self.resolve_storage_dir(destination) if destination is not None else self.uploads_dir
        safe_name = self.generate_safe_filename(filename, directory=target_dir)
        destination_path = target_dir / safe_name

        self._ensure_within_storage_root(destination_path)

        file_obj.seek(0)
        with destination_path.open("wb") as target_file:
            while True:
                chunk = file_obj.read(65536)
                if not chunk:
                    break
                target_file.write(chunk)

        return destination_path

    def resolve_storage_destination(self, category: str, filename: str) -> Path:
        if category is None or not str(category).strip():
            raise FileValidationError("Invalid storage category.")

        normalized = str(category).replace("\\", "/")
        parts = [part for part in normalized.split("/") if part not in ("", ".")]
        if ".." in parts or normalized.startswith(("/", "./", "../", "~")):
            raise FileValidationError("Invalid storage category.")
        if ":" in normalized and normalized[1:3] == ":/":
            raise FileValidationError("Invalid storage category.")

        safe_category = secure_filename(category).lower()
        if not safe_category:
            raise FileValidationError("Invalid storage category.")
        directory = self.resolve_storage_dir(safe_category)
        safe_name = self.generate_safe_filename(filename, directory=directory)
        return directory / safe_name
