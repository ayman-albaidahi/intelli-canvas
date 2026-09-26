import io

import pytest
from auth_helpers import legacy_owner_id
from PIL import Image

from backend.app import create_app
from backend.app.services.file_service import FileStorageService


@pytest.fixture
def conversion_context(tmp_path):
    storage_root = tmp_path / "storage"
    app = create_app(storage_root=storage_root)
    storage_service = FileStorageService(storage_root=storage_root)

    source = Image.new("RGB", (4, 3), color="red")
    source_buffer = io.BytesIO()
    source.save(source_buffer, format="PNG")
    source_buffer.seek(0)
    source_path = storage_service.save_file(source_buffer, "source.png")
    app.test_client()
    session = app.config["IMAGE_SESSION_SERVICE"].create_session(
        {
            "original_filename": "source.png",
            "stored_filename": source_path.name,
            "format": "png",
            "mime_type": "image/png",
            "size": source_path.stat().st_size,
        },
        owner_id=legacy_owner_id(app),
    )
    return app, storage_service, session, source_path


def test_all_supported_format_conversions_return_metadata(
    conversion_context,
):
    app, _, session, _ = conversion_context

    for target_format, expected_mime in [
        ("jpeg", "image/jpeg"),
        ("webp", "image/webp"),
        ("png", "image/png"),
    ]:
        response = app.test_client().post(
            "/api/images/convert",
            json={"image_id": session["image_id"], "format": target_format},
        )

        assert response.status_code == 200
        result = response.get_json()["image"]
        assert result["mime_type"] == expected_mime
        assert result["format"] == target_format
        assert (result["width"], result["height"]) == (4, 3)


@pytest.mark.parametrize(
    "source_format, target_format",
    [
        ("PNG", "jpeg"),
        ("PNG", "webp"),
        ("JPEG", "png"),
        ("JPEG", "webp"),
        ("WEBP", "png"),
        ("WEBP", "jpeg"),
    ],
)
def test_supported_source_and_target_formats_convert(
    conversion_context, source_format, target_format
):
    app, storage_service, _, _ = conversion_context
    extension = "jpg" if source_format == "JPEG" else source_format.lower()
    source = Image.new("RGB", (4, 3), color="blue")
    source_buffer = io.BytesIO()
    source.save(source_buffer, format=source_format)
    source_buffer.seek(0)
    source_path = storage_service.save_file(
        source_buffer, f"{extension}-source.{extension}"
    )
    app.test_client()
    session = app.config["IMAGE_SESSION_SERVICE"].create_session(
        {
            "original_filename": source_path.name,
            "stored_filename": source_path.name,
            "format": extension,
            "mime_type": (
                "image/jpeg" if source_format == "JPEG" else f"image/{extension}"
            ),
            "size": source_path.stat().st_size,
        },
        owner_id=legacy_owner_id(app),
    )

    response = app.test_client().post(
        "/api/images/convert",
        json={"image_id": session["image_id"], "format": target_format},
    )

    assert response.status_code == 200
    result = response.get_json()["image"]
    assert result["format"] == target_format
    assert result["mime_type"] == (
        "image/jpeg" if target_format == "jpeg" else f"image/{target_format}"
    )
    assert (result["width"], result["height"]) == (4, 3)
    processed_files = list(storage_service.processed_dir.iterdir())
    assert len(processed_files) == 1
    with Image.open(processed_files[0]) as converted:
        assert converted.size == (4, 3)
        assert converted.format == (
            "JPEG" if target_format == "jpeg" else target_format.upper()
        )


def test_conversion_preserves_original_and_stores_processed_file(
    conversion_context,
):
    app, storage_service, session, source_path = conversion_context
    original_bytes = source_path.read_bytes()

    response = app.test_client().post(
        "/api/images/convert",
        json={"image_id": session["image_id"], "format": "webp"},
    )

    assert response.status_code == 200
    assert source_path.read_bytes() == original_bytes
    processed_files = list(storage_service.processed_dir.iterdir())
    assert len(processed_files) == 1
    with Image.open(processed_files[0]) as converted:
        assert converted.format == "WEBP"


@pytest.mark.parametrize(
    "target_format, expected_code",
    [
        ("gif", "CONVERSION_FAILED"),
        ("bmp", "CONVERSION_FAILED"),
        ("txt", "CONVERSION_FAILED"),
        ("", "INVALID_FORMAT"),
    ],
)
def test_unsupported_format_is_rejected(
    conversion_context, target_format, expected_code
):
    app, _, session, _ = conversion_context

    response = app.test_client().post(
        "/api/images/convert",
        json={"image_id": session["image_id"], "format": target_format},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == expected_code


def test_missing_session_is_rejected(conversion_context):
    app, _, _, _ = conversion_context

    response = app.test_client().post(
        "/api/images/convert",
        json={"image_id": "missing", "format": "png"},
    )

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "IMAGE_SESSION_NOT_FOUND"


def test_invalid_conversion_payload_is_rejected(conversion_context):
    app, _, _, _ = conversion_context

    response = app.test_client().post(
        "/api/images/convert",
        json={"format": "png"},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_IMAGE_ID"
