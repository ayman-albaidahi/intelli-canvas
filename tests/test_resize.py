import io

import pytest
from PIL import Image

from backend.app import create_app
from backend.app.routes import transform
from backend.app.services.file_service import FileStorageService


@pytest.fixture
def resize_context(tmp_path, monkeypatch):
    app = create_app()
    storage_service = FileStorageService(storage_root=tmp_path / "storage")
    monkeypatch.setattr(transform, "FileStorageService", lambda: storage_service)

    source = Image.new("RGB", (1600, 1200), color="red")
    source_buffer = io.BytesIO()
    source.save(source_buffer, format="PNG")
    source_buffer.seek(0)
    source_path = storage_service.save_file(source_buffer, "source.png")

    session = app.config["IMAGE_SESSION_SERVICE"].create_session(
        {
            "original_filename": "source.png",
            "stored_filename": source_path.name,
            "format": "png",
            "mime_type": "image/png",
            "size": source_path.stat().st_size,
        }
    )
    return app, storage_service, session, source_path


def post_resize(app, image_id, **values):
    payload = {"image_id": image_id, **values}
    return app.test_client().post("/api/transform/resize", json=payload)


def test_resize_by_width_preserves_locked_aspect_ratio(resize_context):
    app, _, session, _ = resize_context

    response = post_resize(app, session["image_id"], width=800, lock_aspect_ratio=True)

    assert response.status_code == 200
    assert response.get_json()["image"] == {
        "image_id": session["image_id"],
        "width": 800,
        "height": 600,
        "format": "png",
        "mime_type": "image/png",
    }


def test_resize_by_height_preserves_locked_aspect_ratio(resize_context):
    app, _, session, _ = resize_context

    response = post_resize(app, session["image_id"], height=600)

    assert response.status_code == 200
    assert response.get_json()["image"]["width"] == 800
    assert response.get_json()["image"]["height"] == 600


def test_resize_with_unlocked_ratio_uses_explicit_dimensions(resize_context):
    app, _, session, _ = resize_context

    response = post_resize(
        app,
        session["image_id"],
        width=800,
        height=800,
        lock_aspect_ratio=False,
    )

    assert response.status_code == 200
    result = response.get_json()["image"]
    assert (result["width"], result["height"]) == (800, 800)


def test_locked_ratio_treats_two_dimensions_as_bounding_box(resize_context):
    app, _, session, _ = resize_context

    response = post_resize(
        app,
        session["image_id"],
        width=800,
        height=800,
        lock_aspect_ratio=True,
    )

    assert response.status_code == 200
    result = response.get_json()["image"]
    assert (result["width"], result["height"]) == (800, 600)


@pytest.mark.parametrize("width", [0, -100, 800.5, "800", True])
def test_invalid_width_is_rejected(resize_context, width):
    app, _, session, _ = resize_context

    response = post_resize(app, session["image_id"], width=width)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_DIMENSIONS"


@pytest.mark.parametrize("height", [0, -100, 600.5, "600", False])
def test_invalid_height_is_rejected(resize_context, height):
    app, _, session, _ = resize_context

    response = post_resize(app, session["image_id"], height=height)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_DIMENSIONS"


def test_missing_dimensions_are_rejected(resize_context):
    app, _, session, _ = resize_context

    response = post_resize(app, session["image_id"])

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_DIMENSIONS"


def test_unlocked_ratio_requires_both_dimensions(resize_context):
    app, _, session, _ = resize_context

    response = post_resize(
        app,
        session["image_id"],
        width=800,
        lock_aspect_ratio=False,
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_DIMENSIONS"


def test_invalid_image_session_id_is_rejected(resize_context):
    app, _, _, _ = resize_context

    response = post_resize(app, "missing-session", width=800)

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "IMAGE_SESSION_NOT_FOUND"


def test_resize_preserves_original_and_creates_processed_file(resize_context):
    app, storage_service, session, source_path = resize_context
    original_bytes = source_path.read_bytes()

    response = post_resize(app, session["image_id"], width=800)

    assert response.status_code == 200
    assert source_path.read_bytes() == original_bytes
    processed_files = list(storage_service.processed_dir.iterdir())
    assert len(processed_files) == 1
    with Image.open(processed_files[0]) as result:
        assert result.size == (800, 600)


def test_resize_response_does_not_expose_internal_storage_details(resize_context):
    app, _, session, _ = resize_context

    response = post_resize(app, session["image_id"], width=800)
    payload = response.get_json()

    assert "stored_filename" not in payload["image"]
    assert "path" not in str(payload).lower()
    assert str(session["stored_filename"]) not in str(payload)
