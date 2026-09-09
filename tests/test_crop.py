import io

import pytest
from PIL import Image

from backend.app import create_app
from backend.app.routes import transform
from backend.app.services.file_service import FileStorageService


@pytest.fixture
def crop_context(tmp_path, monkeypatch):
    app = create_app()
    storage_service = FileStorageService(storage_root=tmp_path / "storage")
    monkeypatch.setattr(transform, "FileStorageService", lambda: storage_service)

    source = Image.new("RGB", (100, 80), color="red")
    buffer = io.BytesIO()
    source.save(buffer, format="PNG")
    buffer.seek(0)
    source_path = storage_service.save_file(buffer, "source.png")
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


def test_crop_creates_processed_image_and_preserves_source(crop_context):
    app, storage_service, session, source_path = crop_context
    original = source_path.read_bytes()

    response = app.test_client().post(
        "/api/transform/crop",
        json={
            "image_id": session["image_id"],
            "x": 10,
            "y": 20,
            "width": 40,
            "height": 30,
        },
    )

    assert response.status_code == 200
    assert response.get_json()["image"]["width"] == 40
    assert response.get_json()["image"]["height"] == 30
    assert source_path.read_bytes() == original
    output = list(storage_service.processed_dir.iterdir())
    assert len(output) == 1
    with Image.open(output[0]) as cropped:
        assert cropped.size == (40, 30)


def test_crop_rejects_out_of_bounds_region(crop_context):
    app, _, session, _ = crop_context

    response = app.test_client().post(
        "/api/transform/crop",
        json={
            "image_id": session["image_id"],
            "x": 90,
            "y": 0,
            "width": 20,
            "height": 20,
        },
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "CROP_FAILED"


@pytest.mark.parametrize(
    "payload",
    [
        {"x": 0, "y": 0, "width": 0, "height": 20},
        {"x": 0, "y": 0, "width": 20, "height": -1},
        {"x": 0, "y": 0, "width": 20.5, "height": 20},
    ],
)
def test_crop_rejects_invalid_region(crop_context, payload):
    app, _, session, _ = crop_context
    payload["image_id"] = session["image_id"]

    response = app.test_client().post("/api/transform/crop", json=payload)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_CROP"
