import io
from pathlib import Path

import pytest
from PIL import Image

from backend.app.services.file_service import FileStorageService, FileValidationError


@pytest.fixture
def storage_service(tmp_path):
    return FileStorageService(
        storage_root=tmp_path / "storage", max_file_size=10 * 1024 * 1024
    )


def _png_bytes(color=(200, 100, 50), size=(2, 2)):
    image = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.mark.parametrize(
    "filename", ["test.png", "photo.jpg", "image.jpeg", "sample.webp", "image.bmp"]
)
def test_valid_image_extensions_are_accepted(storage_service, filename):
    file_obj = io.BytesIO(_png_bytes())

    storage_service.validate_file(file_obj, filename)


def test_non_image_content_is_rejected_even_with_image_extension(storage_service):
    file_obj = io.BytesIO(b"this is definitely not an image payload")

    with pytest.raises(FileValidationError):
        storage_service.validate_file(file_obj, "innocent.png")


def test_valid_png_content_is_accepted_with_any_supported_extension(storage_service):
    file_obj = io.BytesIO(_png_bytes())

    storage_service.validate_file(file_obj, "renamed.jpg")


def test_unsupported_extension_is_rejected(storage_service):
    file_obj = io.BytesIO(_png_bytes())

    with pytest.raises(FileValidationError):
        storage_service.validate_file(file_obj, "document.txt")


def test_invalid_mime_type_is_rejected(storage_service):
    file_obj = io.BytesIO(_png_bytes())
    file_obj.content_type = "text/plain"

    with pytest.raises(FileValidationError):
        storage_service.validate_file(file_obj, "image.png")


def test_oversized_file_is_rejected(storage_service):
    file_obj = io.BytesIO(b"x" * (storage_service.max_file_size + 1))

    with pytest.raises(FileValidationError):
        storage_service.validate_file(
            file_obj, "large.png", max_size=storage_service.max_file_size
        )


def test_empty_file_is_rejected(storage_service):
    file_obj = io.BytesIO(b"")

    with pytest.raises(FileValidationError):
        storage_service.validate_file(file_obj, "empty.png")


@pytest.mark.parametrize(
    "filename",
    [
        "my file.png",
        "naïve_éxample.webp",
        "file@#$.bmp",
        "../escape.png",
        "..\\escape.jpg",
        "/tmp/absolute.png",
        "C:/Windows/system32/evil.bmp",
    ],
)
def test_unsafe_filenames_are_sanitized(storage_service, filename):
    safe_name = storage_service.generate_safe_filename(
        filename, directory=storage_service.uploads_dir
    )

    assert safe_name
    assert ".." not in safe_name
    assert "\\" not in safe_name
    assert "/" not in safe_name
    assert Path(safe_name).name == safe_name


def test_path_traversal_is_blocked(storage_service):
    with pytest.raises(FileValidationError):
        storage_service.resolve_storage_destination("../../secret", "evil.png")


def test_valid_file_is_saved_to_expected_directory(storage_service):
    file_obj = io.BytesIO(_png_bytes())
    saved_path = storage_service.save_file(file_obj, "example.png")

    assert saved_path.parent == storage_service.uploads_dir
    assert saved_path.exists()
    assert saved_path.name.endswith(".png")


def test_generated_filename_does_not_overwrite_existing_file(storage_service):
    first = io.BytesIO(_png_bytes())
    second = io.BytesIO(_png_bytes())

    first_path = storage_service.save_file(first, "duplicate.png")
    second_path = storage_service.save_file(second, "duplicate.png")

    assert first_path != second_path
    assert first_path.exists()
    assert second_path.exists()
